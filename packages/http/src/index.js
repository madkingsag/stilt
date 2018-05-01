// @flow

import Koa from 'koa';
import Router from 'koa-better-router';

export default class StiltHttp {

  static MODULE_IDENTIFIER = Symbol('@stilt/http');

  constructor(config) {
    this.port = config.port;
  }

  initPlugin() {
    const koa = new Koa();

    this.router = Router().loadMethods();

    koa.use(this.router.middleware());

    // TODO only listen plugin if a route is registered
    koa.listen(this.port, () => {
      // TODO pretty server started
      console.log('Server started');
    });
  }

  /**
   * Registers a new route on the HTTP server.
   *
   * @param method The HTTP method that may be used.
   * @param path The path part of the URL on which the route is.
   * @param callback The method handling the route.
   */
  registerRoute(method, path, callback) {
    const asyncCallback = asyncToRestify(callback);

    this.router[method](path, asyncCallback);
  }
}

// TODO support returned streams (ctx.body = someHTTPStream.on('error', ctx.onerror).pipe(PassThrough()))
// TODO handle errors
function asyncToRestify(asyncFunction) {

  return function RestifiedRoute(ctx) {
    const result = asyncFunction(ctx);

    if (result && result.then) {
      return result.then(body => sendResponse(ctx, body));
    }

    return sendResponse(ctx, result);
  };
}

function sendResponse(ctx, body) {
  ctx.body = body;
}

