import fs from 'node:fs';
import path from 'node:path';
import type { IResolvers } from '@graphql-tools/utils';
import type { InjectableIdentifier, TRunnable } from '@stilt/core';
import { App, factory, isRunnable, runnable } from '@stilt/core';
import { StiltHttp } from '@stilt/http';
import type { MaybePromise } from '@stilt/util';
import { asyncGlob, awaitMapAllEntries, coalesce, FORCE_SEQUENTIAL_MODULE_IMPORT } from '@stilt/util';
import type {
  GraphQLNamedType,
  Source, DocumentNode,
} from 'graphql';
import {
  GraphQLObjectType,
  GraphQLSchema,
  isEnumType,
  isNamedType,
  isType,
  GraphQLError,
} from 'graphql';
import type {
  ExecutableSchemaTransformation,
  IDirectiveResolvers,
  SchemaDirectiveVisitor,
  IExecutableSchemaDefinition,
  ITypeDefinitions,
} from 'graphql-tools';
import {
  makeExecutableSchema,
  mergeTypeDefs,
} from 'graphql-tools';
import type { ServerOptions } from 'graphql-ws/lib/server.js';
import { useServer as useWsServer } from 'graphql-ws/lib/use/ws';
import graphqlHTTP from 'koa-graphql';
import mount from 'koa-mount';
import { nanoid } from 'nanoid';
import { classToResolvers } from './decorators.js';
import { IsDevError } from './graphql-errors.js';

export {
  Resolve,
  Mutation,
  Query,
  OnSubscription,
  WithGraphqlQuery,
} from './decorators.js';

export {
  ThrowsUserErrors,

  UserError,
  IsUserError,
} from './user-error.js';

export {
  DevError,
  IsDevError,
} from './graphql-errors.js';

export type Config = {
  /**
   * A file glob to load file that include the type definitions (i.e. Schema files).
   * Set to false if you want to disable globbing and use {@link Config.typeDefs} instead.
   */
  typeDefsGlob?: string | false,

  /**
   * A file glob to load resolver classes.
   * Set to false if you want to disable globbing and use {@link Config.resolvers} instead.
   */
  resolversGlob?: string | false,

  typeDefs?: IExecutableSchemaDefinition['typeDefs'],
  /**
   * Accepts resolvers from graphql-tools, or Resolver Classes (or instances) from Stilt
   */
  resolvers?: IExecutableSchemaDefinition['resolvers'] | Array<IResolvers<any, any> | Object>,

  useGraphiql?: boolean,
  endpoint?: string,
  onError?(error: any, errorCode: string): void,

  schemaDirectives?: {
    [name: string]: typeof SchemaDirectiveVisitor,
  },
  directiveResolvers?: IDirectiveResolvers,
  schemaTransforms?: ExecutableSchemaTransformation[],

  subscriptionConfig?: Omit<ServerOptions, 'schema'>,
};

type IdentifierConfig = {
  /**
   * If specified, defines the key to use to inject this module dependency.
   * Defaults to 'stilt-graphql'
   */
  identifier?: string,

  /**
   * If true, the StiltGraphQl class will be usable as identifier to inject this module as a dependency,
   */
  defaultModule?: boolean,
};

const theSecret = Symbol('secret');

export class StiltGraphQl {
  #schema: GraphQLSchema;
  #httpServer: StiltHttp;
  #config: Config;

  static configure(config: Config | TRunnable<Config> = {}, identifierConfig?: IdentifierConfig) {
    const getConfig: TRunnable<Config> = isRunnable(config) ? config : runnable(() => config);

    const identifiers: InjectableIdentifier[] = [
      identifierConfig?.identifier ?? 'stilt-graphql',
    ];

    if (identifierConfig?.defaultModule ?? true) {
      identifiers.push(StiltGraphQl);
    }

    return factory({
      ids: identifiers,
      // Extra modules being registered by this factory. They must be declared before the end of the constructor.
      // The value can be a promise if the initialisation is async
      build: runnable(async (app, stiltHttp, resolvedConfig) => {
        return StiltGraphQl.asyncModuleInit(app, stiltHttp, resolvedConfig, theSecret);
      }, [App, StiltHttp, getConfig]),
    });
  }

  private static async asyncModuleInit(app: App, stiltHttp: StiltHttp, config: Config, secret: symbol) {

    const schemaGlob = config.typeDefsGlob ?? '**/*.+(schema.{js,mjs,cjs,ts,mts,cts}|graphqls)';
    const resolverGlob = config.resolversGlob ?? '**/*.resolver.{js,mjs,cjs,ts,mts,cts}';

    const [types, resolvers] = await Promise.all([
      this.#loadTypes(schemaGlob || null, config.typeDefs),
      this.#loadResolvers(resolverGlob || null, config.resolvers, app),
    ]);

    return new StiltGraphQl(app, stiltHttp, config, { types, resolvers }, secret);
  }

  static async #loadTypes(schemaGlob: string | null, extraTypeDefs: ITypeDefinitions | undefined) {
    const allTypeDefs: Array<string | Source | DocumentNode | GraphQLSchema> = [];
    if (extraTypeDefs) {
      if (Array.isArray(extraTypeDefs)) {
        for (const type of extraTypeDefs) {
          if (typeof type === 'function') {
            throw new TypeError('function typedef is not currently supported.');
          }

          allTypeDefs.push(type);
        }
      } else {
        allTypeDefs.push(extraTypeDefs);
      }
    }

    const foundNamedTypes: GraphQLNamedType[] = [];
    if (schemaGlob) {
      const schemasFiles = await asyncGlob(schemaGlob);

      const foundSchemas: string[] = [];

      // eslint-disable-next-line unicorn/no-array-callback-reference
      const schemaFiles = await Promise.all(schemasFiles.map(readOrRequireFile));
      for (const schemaFile of schemaFiles) {
        for (const schemaFileEntry of Object.values(schemaFile)) {
          if (typeof schemaFileEntry === 'string') {
            foundSchemas.push(schemaFileEntry);
          } else if (isNamedType(schemaFileEntry)) {
            foundNamedTypes.push(schemaFileEntry);
          } else {
            throw new Error(`${schemaFile} exported a non-string, non-named type value`);
          }
        }
      }

      const namedTypeSchema = new GraphQLSchema({
        types: [
          new GraphQLObjectType({
            name: 'Query',
            fields: {},
          }),
          new GraphQLObjectType({
            name: 'Mutation',
            fields: {},
          }),
          new GraphQLObjectType({
            name: 'Subscription',
            fields: {},
          }),
          ...foundNamedTypes,
        ],
      });

      allTypeDefs.push(namedTypeSchema, ...foundSchemas);
    }

    return {
      typeDefs: mergeTypeDefs(allTypeDefs),
      namedTypes: foundNamedTypes,
    };
  }

  static async #loadResolvers(resolverGlob: string | null, extraResolvers: Config['resolvers'], app: App) {
    const allRawResolvers = [];

    // resolvers passed to config manually
    if (extraResolvers) {
      if (Array.isArray(extraResolvers)) {
        allRawResolvers.push(...extraResolvers);
      } else {
        allRawResolvers.push(extraResolvers);
      }
    }

    /*
     * Resolver files can contain a few different things:
     * - A resolver class (default export only)
     * - A resolver POJO (default export only)
     * - A GraphQL type (eg. a GraphQL enum, any export)
     */

    // resolvers loaded automatically from files
    if (resolverGlob) {
      const resolverFiles = await asyncGlob(resolverGlob);
      const resolverModules = await awaitMapAllEntries(resolverFiles, readOrRequireFile, FORCE_SEQUENTIAL_MODULE_IMPORT);

      for (const resolverExport of resolverModules) {
        for (const exportKey of Object.keys(resolverExport)) {
          const rawResolver = resolverExport[exportKey];

          if (rawResolver == null) {
            continue;
          }

          const typeOfResolver = typeof rawResolver;
          if (typeOfResolver !== 'function' && typeOfResolver !== 'object') {
            continue;
          }

          allRawResolvers.push(rawResolver);
        }
      }
    }

    const resolverInstancePromises: Array<MaybePromise<object>> = [];

    for (const rawResolver of allRawResolvers) {
      if (isNamedType(rawResolver)) {
        resolverInstancePromises.push({
          [rawResolver.name]: rawResolver,
        });

        continue;
      }

      if (isType(rawResolver)) {
        continue;
      }

      if (typeof rawResolver === 'function') {
        resolverInstancePromises.push(
          classToResolvers(rawResolver, app),
          app.instantiate(rawResolver).then(instance => classToResolvers(instance, app)),
        );
      }
    }

    return Promise.all(resolverInstancePromises);
  }

  constructor(app: App, server: StiltHttp, config: Config, { types, resolvers }, secret: symbol) {
    if (secret !== theSecret) {
      throw new Error('You\'re trying to instantiate StiltGraphQl incorrectly.\n'
        + '=> If you\'re trying to instantiate it by doing new StiltGraphQl(), call StiltGraphQl.configure(config) & pass the returned module to App.use instead.\n'
        + '=> If you\'re injecting this module through @Inject or similar, make sure this module was registered through App.use(StiltGraphQl.configure(config))');
    }

    this.#httpServer = server;
    this.#config = config;

    const useGraphiql = coalesce(config.useGraphiql, true);
    const endpoint = coalesce(config.endpoint, '/graphql');
    const logger = app.makeLogger('graphql');

    const { typeDefs, namedTypes } = types;

    if (!typeDefs) {
      logger.info('GraphQL disabled as no schema has been found in project');

      return;
    }

    if (resolvers == null || resolvers.length === 0) {
      logger.info('GraphQL disabled as no resolver has been found in project');

      return;
    }

    const namedTypeResolvers = {};
    for (const type of namedTypes) {
      if (isEnumType(type)) {
        const sourceValueMap = type.toConfig().values;
        const resolverValueMap = {};
        for (const key of Object.keys(sourceValueMap)) {
          resolverValueMap[key] = sourceValueMap[key].value;
        }

        namedTypeResolvers[type.name] = resolverValueMap;

        continue;
      }

      namedTypeResolvers[type.name] = type;
    }

    const schema = makeExecutableSchema({
      typeDefs,
      resolvers: [...resolvers, namedTypeResolvers],
      inheritResolversFromInterfaces: true,
      allowUndefinedInResolve: false,

      schemaDirectives: config.schemaDirectives,
      directiveResolvers: config.directiveResolvers,
      schemaTransforms: config.schemaTransforms,
    });

    server.declareEndpoint('GraphQL', endpoint);
    server.koa.use(mount(endpoint, graphqlHTTP({
      schema,
      graphiql: useGraphiql,
      formatError: error => {
        const originalError = error.originalError;
        if (!originalError || originalError instanceof GraphQLError || error[IsDevError] || originalError[IsDevError]) {
          return error;
        }

        const errorId = nanoid();
        if (config.onError) {
          config.onError(error, errorId);
        }

        console.error(error);

        return {
          message: `Internal Error`,
          internalErrorId: errorId,
        };
      },
    })));

    this.#schema = schema;

    app.lifecycle.on('start', async () => this.#start());
  }

  async #start() {
    if (this.#schema.getSubscriptionType() != null) {
      const webSocketServer = await this.#httpServer.startWebSocketServer('/graphql');

      useWsServer({
        ...this.#config.subscriptionConfig,
        schema: this.#schema,
        onConnect: async ctx => {

          if (ctx.connectionParams) {
            const httpContext = this.#httpServer.getCurrentContext();
            httpContext.graphqlSubscriptionConnectionParams = ctx.connectionParams;
            httpContext.authToken = ctx.connectionParams.authToken;
          }

          await this.#config.subscriptionConfig?.onConnect?.(ctx);
        },
      }, webSocketServer);
    }
  }
}

async function readOrRequireFile(filePath: string) {
  const ext = path.parse(filePath).ext;

  if (ext === '.ts' || ext === '.js') {
    return import(filePath);
  }

  return { default: await fs.promises.readFile(filePath, 'utf8') };
}
