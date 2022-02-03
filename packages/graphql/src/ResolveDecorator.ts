import type { App } from '@stilt/core';
import { wrapControllerWithInjectors } from '@stilt/http/dist/controllerInjectors.js';
import { isPlainObject, getMethodName } from '@stilt/util';
import setProperty from 'lodash/set.js';

type ClassGqlMeta = Map</* methodName */ string | symbol, GqlMeta>;

const resolverMetaPerClass = new WeakMap<Object, ClassGqlMeta>();

type ResolverOptions = { schemaPath: string, parentKey?: string };

type GqlMeta = {
  resolverOptions: ResolverOptions[],
  // subscriptionSchemaPath: string[],
  queryAsParameters?: number,
  postResolvers: Function[],
};

function getGqlMetaForClass(classOrInstance: Object, methodName: string | symbol): GqlMeta {
  if (!resolverMetaPerClass.has(classOrInstance)) {
    resolverMetaPerClass.set(classOrInstance, new Map());
  }

  const classResolverMeta = resolverMetaPerClass.get(classOrInstance)!;
  if (!classResolverMeta.has(methodName)) {
    classResolverMeta.set(methodName, {
      resolverOptions: [],
      // subscriptionSchemaPath: [],
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

// export function Subscribe(schemaPath: string): MethodDecorator {
//   return function decorate(classOrInstance, methodName) {
//     const resolverOptions = getGqlMetaForClass(classOrInstance, methodName);
//
//     resolverOptions.subscriptionSchemaPath.push(schemaPath);
//   };
// }

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
function getResolverMetadata(classOrInstance: Object): ClassGqlMeta | null {
  if (classOrInstance == null) {
    return null;
  }

  return resolverMetaPerClass.get(classOrInstance) ?? null;
}

// export function classToSubscriptionHandler(classOrInstance: Object, stiltApp: App): Object {
//
// }

export function classToResolvers(classOrInstance: Object, stiltApp: App): Object {
  // non objects should map to nothing
  if (classOrInstance === null || (typeof classOrInstance !== 'object' && typeof classOrInstance !== 'function')) {
    return {};
  }

  // POJOs should be used as-is
  if (isPlainObject(classOrInstance)) {
    return classOrInstance;
  }

  const meta: ClassGqlMeta | null = getResolverMetadata(classOrInstance);
  if (!meta) {
    return {};
  }

  const resolvers = Object.create(null);

  meta.forEach((options: GqlMeta, methodName: string) => {

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
  });

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

function lowerFirstLetter(str: string) {
  return str.charAt(0).toLowerCase() + str.slice(1);
}
