// @flow

import { set as setProperty } from 'lodash';
import { wrapControllerWithInjectors } from '@stilt/http/dist/controllerInjectors';

// import deepFreeze from 'deep-freeze-strict';

const Meta = Symbol('graphql-meta');

export type ResolverBuilderOptions = { method: string };
type MetaStruct = Map<string, ResolverBuilderOptions>;

function getSetMeta(func: Function): MetaStruct {
  if (!func[Meta]) {
    func[Meta] = new Map();
  }

  return func[Meta];
}

export function resolve(schemaPath: string): Function {
  return function decorate(Class, methodName) {
    if (Class.constructor !== Function) {
      throw new Error(`Exposing instance methods as GraphQl endpoint is not currently supported (Method: ${Class.constructor.name}#${methodName}).`);
    }

    const routingMetadata = getSetMeta(Class);

    if (routingMetadata.has(schemaPath)) {
      throw new Error(`GraphQL endpoint ${schemaPath} has already been defined on method ${Class.constructor.name}#${routingMetadata.get(schemaPath).method}.`);
    }

    routingMetadata.set(schemaPath, { method: methodName });
  };
}

/**
 * Returns the routing metadata attached to a function
 *
 * Designed for internal use.
 *
 * @param func The function on which the metadata has been attached
 * @return {RoutingMetadata} The routing metadata
 */
function getRoutingMetadata(func: Function): ?MetaStruct {
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

  const meta: ?MetaStruct = getRoutingMetadata(Class);
  if (!meta) {
    return Class;
  }

  const resolvers = {};

  meta.forEach((options: ResolverBuilderOptions, resolverPath: string) => {

    // $FlowBug
    const method = wrapControllerWithInjectors(
      Class,
      options.method,
      normalizeFunction(Class, Class[options.method]),
    );

    setProperty(resolvers, resolverPath, method);
  });

  return resolvers;
}

function normalizeFunction(Class: Function, method: Function): GraphQlFunction {

  return function resolver(parent, parameters) {

    // TODO what if "parameters" already contains key "parent" ?
    // TODO "parent" should be named based on name of parent type.
    parameters.parent = parent;

    return method.call(Class, parameters);
  };
}
