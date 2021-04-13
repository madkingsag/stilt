import fs from 'fs';
import path from 'path';
import { App, factory, InjectableIdentifier, isRunnable, runnable, TRunnable } from '@stilt/core';
import StiltHttp from '@stilt/http';
import { asyncGlob, coalesce } from '@stilt/util';
import { maskErrors } from 'graphql-errors';
import { mergeSchemas } from 'graphql-tools';
import graphqlHTTP from 'koa-graphql';
import mount from 'koa-mount';
import { mergeResolvers, mergeTypes } from 'merge-graphql-schemas';
import { classToResolvers } from './ResolveDecorator';

export {
  resolve,
  resolve as Resolve,

  withGraphqlQuery,
  withGraphqlQuery as WithGraphqlQuery,
} from './ResolveDecorator';

export {
  throwsUserErrors,
  throwsUserErrors as ThrowsUserErrors,

  UserError,
  IsUserError,
} from './UserError';

export {
  UserError as DevError,
  IsUserError as IsDevError,
} from 'graphql-errors';

export type Config = {
  schemas?: string,
  resolvers?: string,
  useGraphiql?: boolean,
  endpoint?: string,
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

export default class StiltGraphQl {

  static configure(config: Config | TRunnable<Config> = {}, identifierConfig?: IdentifierConfig) {
    const getConfig: TRunnable<Config> = isRunnable(config) ? config : runnable(() => config);

    const identifiers: Array<InjectableIdentifier> = [
      identifierConfig?.identifier ?? 'stilt-graphql',
    ];

    if (identifierConfig?.defaultModule ?? true) {
      identifiers.push(StiltGraphQl);
    }

    return factory({
      ids: identifiers,
      // Extra modules being registered by this factory. They must be declared before the end of the constructor.
      // The value can be a promise if the initialisation is async
      build: runnable((app, stiltHttp, resolvedConfig) => {
        return StiltGraphQl.asyncModuleInit(app, stiltHttp, resolvedConfig, theSecret);
      }, [App, StiltHttp, getConfig]),
    });
  }

  private static async asyncModuleInit(app: App, stiltHttp: StiltHttp, config: Config, secret: symbol) {

    const schemaGlob = config.schemas || '**/*.+(schema.js|graphqls)';
    const resolverGlob = config.resolvers || '**/*.resolver.js';

    const [types, resolvers] = await Promise.all([
      this._loadTypes(schemaGlob),
      this._loadResolvers(app, resolverGlob),
    ]);

    return new StiltGraphQl(app, stiltHttp, config, { types, resolvers }, secret);
  }

  private static async _loadTypes(schemaGlob) {
    const schemasFiles = await asyncGlob(schemaGlob);

    if (schemasFiles.length === 0) {
      return null;
    }

    const types = [];
    const foundSchemas: string[] = [];

    const schemaFiles = await Promise.all(schemasFiles.map(readOrRequireFile));
    for (const schemaFile of schemaFiles) {
      for (const schemaFileEntry of Object.values(schemaFile)) {
        if (typeof schemaFileEntry === 'string') {
          foundSchemas.push(schemaFileEntry);
        } else {
          types.push(schemaFileEntry);
        }
      }
    }

    return [mergeTypes(foundSchemas), types];
  }

  private static async _loadResolvers(app: App, resolverGlob) {
    const resolverFiles = await asyncGlob(resolverGlob);

    if (resolverFiles.length === 0) {
      return null;
    }

    const resolverClasses = await Promise.all(resolverFiles.map(readOrDefaultRequireFile));

    // create an instance for each resolver
    const resolverInstances = await Promise.all(
      resolverClasses.map(resolverClass => {
        if (typeof resolverClass === 'function') {
          return app.instantiate(resolverClass);
        }

        return null;
      }),
    );

    // extract all graphql resolvers from static methods
    const staticResolvers = resolverClasses.map(instance => classToResolvers(instance, app));

    // extract all graphql resolvers from instance methods
    const instanceResolvers = resolverInstances.map(instance => classToResolvers(instance, app));

    // @ts-ignore
    return mergeResolvers([...staticResolvers, ...instanceResolvers]);
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

    if (types == null || types.length === 0) {
      logger.info('GraphQL disabled as no schema has been found in project');

      return;
    }

    if (resolvers == null || resolvers.length === 0) {
      logger.info('GraphQL disabled as no resolver has been found in project');

      return;
    }

    const schema = mergeSchemas({
      schemas: types,
      resolvers,
      inheritResolversFromInterfaces: true,
    });

    maskErrors(schema);

    server.declareEndpoint('GraphQL', endpoint);
    server.koa.use(mount(endpoint, graphqlHTTP({
      schema,
      graphiql: useGraphiql,
    })));
  }
}

async function readOrRequireFile(filePath) {
  const ext = path.parse(filePath).ext;

  if (ext === '.ts' || ext === '.js') {
    return require(filePath);
  }

  return { default: await fs.promises.readFile(filePath, 'utf8') };
}

function readOrDefaultRequireFile(filePath) {
  const ext = path.parse(filePath).ext;

  if (ext === '.ts' || ext === '.js') {
    const module = require(filePath);

    return module.default || module;
  }

  return fs.promises.readFile(filePath, 'utf8');
}
