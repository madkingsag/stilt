import type { App } from '@stilt/core';
import { wrapControllerWithInjectors } from '@stilt/http/dist/controller-injectors.js';
import { isPlainObject, getMethodName } from '@stilt/util';
import setProperty from 'lodash/set.js';

type ClassGqlMeta = Map</* methodName */ string | symbol, GqlMeta>;

const ResolverMetaKey = Symbol('resolver-meta');

type ResolverOptions = { schemaPath: string, parentKey?: string };

type GqlMeta = {
  resolverOptions: ResolverOptions[],
  subscriptionSchemaPath: string[],
  queryAsParameters?: number,
  postResolvers: Function[],
};

function getGqlMetaForClass(classOrInstance: Object, methodName: string | symbol): GqlMeta {
  if (!(ResolverMetaKey in classOrInstance)) {
    classOrInstance[ResolverMetaKey] = new Map();
  }

  const classResolverMeta = classOrInstance[ResolverMetaKey]!;
  if (!classResolverMeta.has(methodName)) {
    classResolverMeta.set(methodName, {
      resolverOptions: [],
      subscriptionSchemaPath: [],
      postResolvers: [],
    });
  }

  return classResolverMeta.get(methodName);
}

export function Resolve(schemaPath: string, opts?: { parentKey?: string }): MethodDecorator {
  return function decorate(classOrInstance, methodName) {
    const resolverOptions = getGqlMetaForClass(classOrInstance, methodName);

    resolverOptions.resolverOptions.push({
      schemaPath,
      parentKey: opts?.parentKey,
    });
  };
}

export function Mutation(schemaPath: string, opts?: { parentKey?: string }): MethodDecorator {
  return Resolve(`Mutation.${schemaPath}`, opts);
}

export function Query(schemaPath: string, opts?: { parentKey?: string }): MethodDecorator {
  return Resolve(`Query.${schemaPath}`, opts);
}

export function OnSubscription(schemaPath: string): MethodDecorator {
  return function decorate(classOrInstance, methodName) {
    const gqlOptions = getGqlMetaForClass(classOrInstance, methodName);

    gqlOptions.subscriptionSchemaPath.push(`Subscription.${schemaPath}`);
  };
}

export function WithGraphqlQuery(paramNum: number): MethodDecorator {

  return function decorate(classOrInstance, methodName) {
    const gqlOptions = getGqlMetaForClass(classOrInstance, methodName);

    if ('queryAsParameters' in gqlOptions) {
      throw new Error(`@WithGraphqlQuery has already been used on resolver ${getMethodName(classOrInstance, methodName)}`);
    }

    gqlOptions.queryAsParameters = paramNum;
  };
}

// TODO don't expose addPostResolver yet, need research on how to add hooks to this API.
export function addPostResolver(
  classOrInstance: Object,
  methodName: string | symbol,
  callback: (err: Error | null, data: any | null) => any,
) {
  const resolverOptions = getGqlMetaForClass(classOrInstance, methodName);

  resolverOptions.postResolvers.push(callback);
}

/**
 * Returns the resolver metadata attached to a function
 *
 * Designed for internal use.
 *
 * @param classOrInstance The function on which the metadata has been attached
 * @return The routing metadata
 */
function getGqlMeta(classOrInstance: Object): ClassGqlMeta | null {
  if (classOrInstance == null) {
    return null;
  }

  return classOrInstance[ResolverMetaKey] ?? null;
}

export function classToResolvers(classOrInstance: Object, stiltApp: App): Object {
  const resolvers = Object.create(null);

  // non objects should map to nothing
  if (classOrInstance === null || (typeof classOrInstance !== 'object' && typeof classOrInstance !== 'function')) {
    return resolvers;
  }

  // POJOs should be used as-is
  if (isPlainObject(classOrInstance)) {
    return classOrInstance;
  }

  const meta: ClassGqlMeta | null = getGqlMeta(classOrInstance);

  if (!meta) {
    return resolvers;
  }

  for (const [methodName, options] of meta.entries()) {
    for (const resolverOption of options.resolverOptions) {
      const method = normalizeFunction(
        classOrInstance,
        wrapControllerWithInjectors(
          classOrInstance,
          methodName,
          classOrInstance[methodName],
          stiltApp,
        ),
        options,
        resolverOption,
      );

      setProperty(resolvers, resolverOption.schemaPath, method);
    }

    for (const subscriptionSchemaPath of options.subscriptionSchemaPath) {
      const method = normalizeFunction(
        classOrInstance,
        wrapControllerWithInjectors(
          classOrInstance,
          methodName,
          classOrInstance[methodName],
          stiltApp,
        ),
        options,
        { schemaPath: subscriptionSchemaPath },
      );

      setProperty(resolvers, subscriptionSchemaPath, {
        subscribe: method,
        // pass down value yielded by subscription
        resolve: val => val,
      });
    }
  }

  return resolvers;
}

function normalizeFunction(
  classOrInstance: Object,
  method: Function,
  options: GqlMeta,
  resolverOptions: ResolverOptions,
): Function {

  const parentName = resolverOptions.parentKey || lowerFirstLetter(nthLastItem(resolverOptions.schemaPath.split('.'), 1));

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
      resultNode = await method.apply(classOrInstance, methodParameters);
    } catch (error) {
      resultError = error;
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
      } catch (error) {
        err = error;
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

function lowerFirstLetter(str: string) {
  return str.charAt(0).toLowerCase() + str.slice(1);
}
