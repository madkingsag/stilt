import fs from 'fs';
import path from 'path';
import type { InjectableIdentifier, TRunnable } from '@stilt/core';
import { App, factory, isRunnable, runnable } from '@stilt/core';
import { StiltHttp } from '@stilt/http';
import { asyncGlob, coalesce } from '@stilt/util';
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
import graphqlHTTP from 'koa-graphql';
import mount from 'koa-mount';
import { nanoid } from 'nanoid';
import { classToResolvers } from './ResolveDecorator.js';
import { IsDevError } from './graphql-errors.js';

export {
  resolve,
  resolve as Resolve,

  withGraphqlQuery,
  withGraphqlQuery as WithGraphqlQuery,
} from './ResolveDecorator.js';

export {
  throwsUserErrors,
  throwsUserErrors as ThrowsUserErrors,

  UserError,
  IsUserError,
} from './UserError.js';

export {
  DevError,
  IsDevError,
} from './graphql-errors.js';

export type Config = {
  typeDefsGlob?: string,
  resolversGlob?: string,

  typeDefs?: IExecutableSchemaDefinition['typeDefs'],
  resolvers?: IExecutableSchemaDefinition['resolvers'],

  useGraphiql?: boolean,
  endpoint?: string,
  onError?(error: any, errorCode: string): void,

  schemaDirectives?: {
    [name: string]: typeof SchemaDirectiveVisitor,
  },
  directiveResolvers?: IDirectiveResolvers,
  schemaTransforms?: ExecutableSchemaTransformation[],
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

    const schemaGlob = config.typeDefsGlob || '**/*.+(schema.{js,ts}|graphqls)';
    const resolverGlob = config.resolversGlob || '**/*.resolver.{js,ts}';

    const [types, resolvers] = await Promise.all([
      this._loadTypes(schemaGlob, config.typeDefs),
      this._loadResolvers(app, resolverGlob),
    ]);

    if (config.resolvers) {
      if (Array.isArray(config.resolvers)) {
        resolvers.push(...config.resolvers);
      } else {
        resolvers.push(config.resolvers);
      }
    }

    return new StiltGraphQl(app, stiltHttp, config, { types, resolvers }, secret);
  }

  private static async _loadTypes(schemaGlob: string, extraTypeDefs: ITypeDefinitions | undefined) {
    const schemasFiles = await asyncGlob(schemaGlob);

    if (schemasFiles.length === 0) {
      return null;
    }

    const foundSchemas: string[] = [];
    const foundNamedTypes: GraphQLNamedType[] = [];

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

    if (foundSchemas.length === 0) {
      return null;
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
        ...foundNamedTypes,
      ],
    });

    const allTypeDefs: Array<string | Source | DocumentNode | GraphQLSchema> = [namedTypeSchema, ...foundSchemas];
    if (extraTypeDefs) {
      if (Array.isArray(extraTypeDefs)) {
        for (const type of extraTypeDefs) {
          if (typeof type === 'function') {
            throw new Error('function typedef is not currently supported.');
          }

          allTypeDefs.push(type);
        }
      } else {
        allTypeDefs.push(extraTypeDefs);
      }
    }

    return {
      typeDefs: mergeTypeDefs(allTypeDefs),
      namedTypes: foundNamedTypes,
    };
  }

  private static async _loadResolvers(app: App, resolverGlob: string) {
    const resolverFiles = await asyncGlob(resolverGlob);

    if (resolverFiles.length === 0) {
      return null;
    }

    /*
     * Resolver files can contain a few different things:
     * - A resolver class (default export only)
     * - A resolver POJO (default export only)
     * - A GraphQL type (eg. a GraphQL enum, any export)
     */

    const resolverExports = await Promise.all(resolverFiles.map(readOrRequireFile));

    const resolverInstancePromises = [];
    for (const resolverExport of resolverExports) {
      for (const exportKey of Object.keys(resolverExport)) {
        const rawResolver = resolverExport[exportKey];

        if (isNamedType(rawResolver)) {
          resolverInstancePromises.push({
            [rawResolver.name]: rawResolver,
          });
        }
      }

      if ('default' in resolverExport && !isType(resolverExport.default)) {
        resolverInstancePromises.push(classToResolvers(resolverExport.default, app));

        if (typeof resolverExport.default === 'function') {
          resolverInstancePromises.push(
            app.instantiate(resolverExport.default)
              .then(instance => classToResolvers(instance, app)),
          );
        }
      }
    }

    const resolverInstances = await Promise.all(resolverInstancePromises);

    // TODO: check we can remove mergeResolvers

    return resolverInstances;
  }

  constructor(app: App, server: StiltHttp, config: Config, { types, resolvers }, secret: symbol) {
    if (secret !== theSecret) {
      throw new Error('You\'re trying to instantiate StiltGraphQl incorrectly.\n'
        + '=> If you\'re trying to instantiate it by doing new StiltGraphQl(), call StiltGraphQl.configure(config) & pass the returned module to App.use instead.\n'
        + '=> If you\'re injecting this module through @Inject or similar, make sure this module was registered through App.use(StiltGraphQl.configure(config))');
    }

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
  }
}

async function readOrRequireFile(filePath) {
  const ext = path.parse(filePath).ext;

  if (ext === '.ts' || ext === '.js') {
    return import(filePath);
  }

  return { default: await fs.promises.readFile(filePath, 'utf8') };
}
