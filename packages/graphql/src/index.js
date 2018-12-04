// @flow

import path from 'path';
import fs from 'fs';
import StiltHttp from '@stilt/http';
import { asyncGlob, coalesce } from '@stilt/util';
import { mergeTypes, mergeResolvers } from 'merge-graphql-schemas';
import { makeExecutableSchema } from 'graphql-tools';
import { maskErrors } from 'graphql-errors';
import mount from 'koa-mount';
import graphqlHTTP from 'koa-graphql';
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

export default class StiltGraphQl {

  static MODULE_IDENTIFIER = Symbol('@stilt/graphql');

  constructor(config = {}) {

    this._config = {
      schemaGlob: config.schemas || '**/*.+(schema.js|graphqls)',
      resolverGlob: config.resolvers || '**/*.resolver.js',
      useGraphiql: coalesce(config.useGraphiql, true),
      endpoint: coalesce(config.endpoint, '/graphql'),
    };
  }

  async init(app) {
    this._app = app;

    this.logger = app.makeLogger('graphql');

    this.server = app.getPlugin(StiltHttp);

    await this._loadSchema();
  }

  async _loadSchema() {
    const { schemaGlob, resolverGlob, useGraphiql, endpoint } = this._config;

    const [graphqlTypes, graphqlResolvers] = await Promise.all([
      this._loadTypes(schemaGlob),
      this._loadResolvers(resolverGlob),
    ]);

    if (graphqlTypes == null) {
      this.logger.info('GraphQL disabled as no schema has been found in project');
      return;
    }

    if (graphqlResolvers == null) {
      this.logger.info('GraphQL disabled as no resolver has been found in project');
      return;
    }

    const schema = makeExecutableSchema({
      typeDefs: graphqlTypes,
      resolvers: graphqlResolvers,
      inheritResolversFromInterfaces: true,
    });

    maskErrors(schema);

    this.server.declareEndpoint('GraphQL', endpoint);

    this.server.koa.use(mount(endpoint, graphqlHTTP({
      schema,
      graphiql: useGraphiql,
    })));
  }

  async _loadTypes(schemaGlob) {
    const schemasFiles = await asyncGlob(schemaGlob);

    if (schemasFiles.length === 0) {
      return null;
    }

    const schemasParts = await Promise.all(schemasFiles.map(readOrRequireFile));

    return mergeTypes(schemasParts);
  }

  async _loadResolvers(resolverGlob) {
    const resolverFiles = await asyncGlob(resolverGlob);

    if (resolverFiles.length === 0) {
      return null;
    }

    const resolverClasses = await Promise.all(resolverFiles.map(readOrRequireFile));

    // create an instance for each resolver
    const resolverInstances = await Promise.all(
      resolverClasses.map(resolverClass => {
        if (typeof resolverClass === 'function') {
          return this._app.instanciate(resolverClass);
        }

        return null;
      })
    );

    // extract all graphql resolvers from static methods
    const staticResolvers = resolverClasses.map(instance => classToResolvers(instance, this._app));

    // extract all graphql resolvers from instance methods
    const instanceResolvers = resolverInstances.map(instance => classToResolvers(instance, this._app));

    return mergeResolvers([...staticResolvers, ...instanceResolvers]);
  }
}

// TODO move to common "utils"

export function readOrRequireFile(filePath) {
  const ext = path.parse(filePath).ext;

  if (ext === '.ts' || ext === '.js') {
    const module = require(filePath);

    return module.default || module;
  }

  return fs.promises.readFile(filePath, 'utf8');
}
