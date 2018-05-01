// @flow

import deepFreeze from 'deep-freeze-strict';

const Meta = Symbol('routing-meta');

export type RoutingMetadata = Route[];

export type Route = {
  method: string,
  path: string,
};

// TODO store metadata on class
function getSetMeta(func: Function): RoutingMetadata {
  if (!func[Meta]) {
    func[Meta] = [];
  }

  return func[Meta];
}

function makeHttpMethod(httpMethod): Function {
  return function decorator(path) {
    return function decorate(Class, methodName) {
      if (Class.constructor !== Function) {
        throw new Error(`Expose non static method as REST endpoint is not currently supported (Method: ${Class.constructor.name}#${methodName}).`);
      }

      const target = Class[methodName];
      const routingMetadata = getSetMeta(target);

      routingMetadata.push({
        method: httpMethod,
        path,
      });
    };
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
export function getRoutingMetadata(func: Function): ?RoutingMetadata {
  if (func == null || !func[Meta]) {
    return null;
  }

  const meta = func[Meta];

  // TODO move deepFreeze to finalizer (once new decorators are available).
  deepFreeze(meta);

  return meta;
}

/**
 * Mark a function as being accessible via HTTP on a given path with a GET request
 *
 * @param path The path on which the method is exposed
 * @type {(path: string) => Function}
 */
export const GET = makeHttpMethod('get');

/**
 * Mark a function as being accessible via HTTP on a given path with a POST request
 *
 * @param path The path on which the method is exposed
 * @type {(path: string) => Function}
 */
export const POST = makeHttpMethod('post');

/**
 * Mark a function as being accessible via HTTP on a given path with a PUT request
 *
 * @param path The path on which the method is exposed
 * @type {(path: string) => Function}
 */
export const PUT = makeHttpMethod('put');

/**
 * Mark a function as being accessible via HTTP on a given path with a PATCH request
 *
 * @param path The path on which the method is exposed
 * @type {(path: string) => Function}
 */
export const PATCH = makeHttpMethod('patch');

/**
 * Mark a function as being accessible via HTTP on a given path with a DELETE request
 *
 * @param path The path on which the method is exposed
 * @type {(path: string) => Function}
 */
export const DELETE = makeHttpMethod('del');
