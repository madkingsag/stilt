import deepFreeze from 'deep-freeze-strict';

const Meta = Symbol('rest-routing-meta');

export type RoutingMetadata = Route[];

export type Route = {
  handlerName: string | symbol,
  httpMethod: string,
  path: string,
};

function getSetMeta(func: Object): RoutingMetadata {
  if (!func[Meta]) {
    func[Meta] = [];
  }

  return func[Meta];
}

function makeHttpMethod(httpMethod): (path: string) => MethodDecorator {
  return function decorator(path: string): MethodDecorator {
    return function decorate(Class, methodName) {

      const routingMetadata = getSetMeta(Class);

      routingMetadata.push({
        handlerName: methodName,
        httpMethod,
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
export function getRoutingMetadata(func: Function): RoutingMetadata | null {
  if (func == null || !func[Meta]) {
    return null;
  }

  const meta = func[Meta];

  // TODO move deepFreeze to finalizer (once new decorators are available).
  deepFreeze(meta);

  return meta ?? null;
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

// TODO: Add @Accept() to filter based on Accept header (application/json by default).
// TODO: Add @ContentType(), application/json by default. If not application/json, return raw.
