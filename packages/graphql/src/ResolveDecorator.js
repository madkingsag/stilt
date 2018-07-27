// @flow

import { set as setProperty } from 'lodash';
import { wrapControllerWithInjectors } from '@stilt/http/dist/controllerInjectors';

const Meta = Symbol('graphql-meta');

type ResolverClassMetadata = Map<string, ResolverOptions>;
type ResolverOptions = {
  schemaKey: string,
  queryAsParameters?: number,
  parentKey?: string,
  postResolvers?: Array<Function>,
};

function getSetMeta(Class: Function, methodName: string): ResolverOptions {
  if (!Class[Meta]) {
    Class[Meta] = new Map();
  }

  if (!Class[Meta].has(methodName)) {
    Class[Meta].set(methodName, {});
  }

  return Class[Meta].get(methodName, {});
}

function resolve(schemaPath: string, opts?: { parentKey?: string }): Function {
  return function decorate(Class, methodName) {
    if (Class.constructor !== Function) {
      throw new Error(`Exposing instance methods as GraphQl endpoint is not currently supported (Method: ${Class.constructor.name}#${methodName}).`);
    }

    const resolverOptions = getSetMeta(Class, methodName);

    resolverOptions.schemaKey = schemaPath;

    if (opts && opts.parentKey) {
      resolverOptions.parentKey = opts.parentKey;
    }
  };
}

function withGraphqlQuery(paramNum: number): Function {

  return function decorate(Class, methodName) {

    if (Class.constructor !== Function) {
      throw new Error(`Exposing instance methods as GraphQl endpoint is not currently supported (Method: ${Class.constructor.name}#${methodName}).`);
    }

    const resolverOptions = getSetMeta(Class, methodName);

    resolverOptions.queryAsParameters = paramNum;
  };
}

// TODO don't expose addPostResolver yet, need research on how to add hooks to this API.
export function addPostResolver(Class: Function, methodName: string, callback: (?Error, ?mixed) => mixed) {

  const resolverOptions = getSetMeta(Class, methodName);

  resolverOptions.postResolvers = resolverOptions.postResolvers || [];

  resolverOptions.postResolvers.push(callback);
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

  const parentName = options.parentKey || lowerFirstLetter(nthLastItem(options.schemaKey.split('.'), 1));

  return async function resolver(parent, graphqlQueryParameters, koaContext, graphqlQuery) {

    // Node.__resolveType does not have parameters.
    if (graphqlQuery === void 0) {
      graphqlQuery = koaContext;
      koaContext = graphqlQueryParameters;
      graphqlQueryParameters = {};
    }

    if (parent != null) {
      graphqlQueryParameters[parentName] = parent;
    }

    const methodParameters = [graphqlQueryParameters];
    if (options.queryAsParameters !== void 0) {
      methodParameters[options.queryAsParameters] = { query: graphqlQuery };
    }

    let resultNode;
    let resultError;

    try {
      resultNode = await method.apply(Class, methodParameters);
    } catch (e) {
      resultError = e;
    }

    return runPostResolvers(resultError, resultNode, options.postResolvers);
  };
}

function runPostResolvers(err, value, resolvers) {

  if (resolvers) {
    for (const resolver of resolvers) {
      try {
        value = resolver(err, value);
        err = null;
      } catch (e) {
        err = e;
      }
    }
  }

  if (err) {
    throw err;
  }

  return value;
}

function nthLastItem(arr, num = 0) {
  return arr[arr.length - (num + 1)];
}

function lowerFirstLetter(string) {
  return string.charAt(0).toLowerCase() + string.slice(1);
}

export {
  resolve,
  withGraphqlQuery,
};
