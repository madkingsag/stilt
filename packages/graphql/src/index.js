// @flow

import assert from 'assert';
import StiltHttp from '@stilt/http';
import { fileLoader, mergeTypes, mergeResolvers } from 'merge-graphql-schemas';
import { makeExecutableSchema } from 'graphql-tools';
import { maskErrors } from 'graphql-errors';
import mount from 'koa-mount';
import graphqlHTTP from 'koa-graphql';
import { classToResolvers } from './ResolveDecorator';

export { resolve, Resolve, withGraphqlQuery, WithGraphqlQuery } from './ResolveDecorator';

export default class StiltGraphQl {

  static MODULE_IDENTIFIER = Symbol('@stilt/graphql');

  constructor(config) {
    this._config = config;
  }

  postInitPlugin(app) {
    // this.logger = app.makeLogger('graphql');

    this.server = app.getPlugin(StiltHttp.MODULE_IDENTIFIER);
    this.loadSchema();
  }

  loadSchema() {
    const schemaDir = this._config.schema;
    const resolverDir = this._config.resolvers;
    const useGraphiql = coalesce(this._config.useGraphiql, true);
    const endpoint = coalesce(this._config.endpoint, '/graphql');

    const graphqlTypes = mergeTypes(fileLoader(schemaDir, { recursive: true }));
    const resolvers = fileLoader(resolverDir, { recursive: true });

    const graphqlResolvers = mergeResolvers(resolvers.map(classToResolvers));

    const schema = makeExecutableSchema({
      typeDefs: graphqlTypes,
      resolvers: graphqlResolvers,
    });

    maskErrors(schema);

    this.server.declareEndpoint('GraphQL', endpoint);

    this.server.koa.use(mount(endpoint, graphqlHTTP({
      schema,
      graphiql: useGraphiql,
    })));
  }
}

// TODO move to common "utils"
function coalesce(...args) {
  assert(args.length > 0, 'Must have at least one argument');

  for (let i = 0; i < args.length - 1; i++) {
    const arg = args[i];
    if (arg != null) {
      return arg;
    }
  }

  return args[args.length - 1];
}
