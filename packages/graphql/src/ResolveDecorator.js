// @flow

import { set as setProperty } from 'lodash';
import { wrapControllerWithInjectors } from '@stilt/http/dist/controllerInjectors';

const Meta = Symbol('graphql-meta');

type ResolverClassMetadata = Map<string, ResolverOptions>;
type ResolverOptions = { schemaKey: string, queryAsParameters?: number };

function getSetMeta(Class: Function, methodName: string): ResolverOptions {
  if (!Class[Meta]) {
    Class[Meta] = new Map();
  }

  if (!Class[Meta].has(methodName)) {
    Class[Meta].set(methodName, {});
  }

  return Class[Meta].get(methodName, {});
}

export function resolve(schemaPath: string): Function {
  return function decorate(Class, methodName) {
    if (Class.constructor !== Function) {
      throw new Error(`Exposing instance methods as GraphQl endpoint is not currently supported (Method: ${Class.constructor.name}#${methodName}).`);
    }

    const resolverOptions = getSetMeta(Class, methodName);

    resolverOptions.schemaKey = schemaPath;
  };
}

export function withGraphqlQuery(paramNum: number): Function {

  return function decorate(Class, methodName) {

    if (Class.constructor !== Function) {
      throw new Error(`Exposing instance methods as GraphQl endpoint is not currently supported (Method: ${Class.constructor.name}#${methodName}).`);
    }

    const resolverOptions = getSetMeta(Class, methodName);

    resolverOptions.queryAsParameters = paramNum;
  };
}

/**
 * Returns the resolver metadata attached to a function
 *
 * Designed for internal use.
 *
 * @param func The function on which the metadata has been attached
 * @return {RoutingMetadata} The routing metadata
 */
function getResolverMetadata(func: Function): ?ResolverClassMetadata {
  if (func == null || !func[Meta]) {
    return null;
  }

  const meta = func[Meta];

  return meta;
}

export function classToResolvers(Class: Function | Object): Object {
  if (typeof Class !== 'function') {
    return Class;
  }

  const meta: ?ResolverClassMetadata = getResolverMetadata(Class);
  if (!meta) {
    return Class;
  }

  const resolvers = {};

  meta.forEach((options: ResolverOptions, methodName: string) => {

    const method = normalizeFunction(
      Class,
      wrapControllerWithInjectors(
        Class,
        methodName,
        Class[methodName],
      ),
      options,
    );

    setProperty(resolvers, options.schemaKey, method);
  });

  return resolvers;
}

function normalizeFunction(Class: Function, method: Function, options: ResolverOptions): Function {

  return function resolver(parent, graphqlQueryParameters, koaContext, graphqlQuery) {

    graphqlQueryParameters.parent = parent;

    // TODO what if "parameters" already contains key "parent" ?
    // TODO "parent" should be named based on name of parent type.
    const methodParameters = [graphqlQueryParameters];
    if (options.queryAsParameters !== void 0) {
      methodParameters[options.queryAsParameters] = { query: graphqlQuery };
    }

    return method.apply(Class, methodParameters);
  };
}
