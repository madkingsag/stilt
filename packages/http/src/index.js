// @flow

import Koa from 'koa';
import Router from 'koa-better-router';
import bodyParser from 'koa-bodyparser';
import ip from 'ip';
import chalk from 'chalk';
import { AsyncHookMap } from 'async-hooks-map';
import ContextProvider from './ContextProvider';

export { makeControllerInjector } from './controllerInjectors';
export const IContextProvider = Symbol('context-provider');

// for an unknown reason, if I build the map in the constructor,
// it will be unable to find "root" during request processing.
const CONTEXT_MAP = new AsyncHookMap();
CONTEXT_MAP.alias('root');

export default class StiltHttp {

  static MODULE_IDENTIFIER = Symbol('@stilt/http');
  _contextField = Symbol('context');

  _declaredEndpoints = [];

  constructor(config) {
    this.port = config.port;

    this.koa = new Koa();

    // TODO only run bodyParser if body is requested by method (eg @BodyParams in rest)
    this.koa.use(bodyParser());

    this.router = Router().loadMethods();
  }

  preInitPlugin(app) {
    this.logger = app.makeLogger('http');

    this.koa.use((ctx, next) => {
      CONTEXT_MAP.closest('root').set(this._contextField, ctx);

      return next();
    });

    app.registerInjectables({
      [IContextProvider]: new ContextProvider(this),
    });
  }

  postInitPlugin() {
    this.koa.use(this.router.middleware());

    // TODO only listen plugin if a route is registered
    this.koa.listen(this.port, () => {
      this._printServerStarted(this.port);
    });
  }

  /**
   * @returns the context of the request that is currently being processed. Null if no request is being processed.
   */
  getCurrentContext() {
    return CONTEXT_MAP.closest('root').get(this._contextField);
  }

  /**
   * Registers a new route on the HTTP server.
   *
   * @param method The HTTP method that may be used.
   * @param path The path part of the URL on which the route is.
   * @param callback The method handling the route.
   */
  registerRoute(method, path, callback) {
    const asyncCallback = asyncToKoa(callback);

    this.router[method](path, asyncCallback);
  }

  /**
   * Add an endpoint of interest when printing server started log
   */
  declareEndpoint(endpointName, endpointPath) {
    this._declaredEndpoints.push({ name: endpointName, path: endpointPath });
  }

  /**
   * @param port
   * @private
   */
  _printServerStarted(port) {
    chalk.enabled = true;

    const localhost = `http://localhost:${port}`;

    const lines = [
      chalk.bold('Access URLs:'),
      '---',
      ['Localhost', localhost],
      ['LAN', `http://${ip.address()}:${port}`],
      '---',
    ];

    if (this._declaredEndpoints.length > 0) {
      for (const endpoint of this._declaredEndpoints) {
        lines.push([endpoint.name, localhost + endpoint.path]);
      }

      lines.push('---');
    }

    lines.push(chalk.blue(`Press ${chalk.italic('CTRL-C')} to stop`));

    this.logger.info(`Server started ${chalk.green('✓')}`);
    this.logger.info();
    this.logger.info(printTable(lines));
    this.logger.info();
  }
}

function printTable(lines) {

  let dividerLength = 0;
  let titleLength = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (Array.isArray(line)) {
      const title = line[0];
      if (titleLength < title.length) {
        titleLength = title.length;
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {

    const line = lines[i];
    if (Array.isArray(line)) {
      const [title, content] = line;
      const alignementSpacing = ' '.repeat(titleLength - title.length);
      lines[i] = `${alignementSpacing}${title}: ${chalk.magenta(content)}`;
    }

    // remove control characters as they are not visible but still increase .length.
    const newLine = clearAinsiColors(lines[i]);
    if (newLine.length > dividerLength) {
      dividerLength = newLine.length;
    }
  }

  const divider = chalk.gray('-'.repeat(dividerLength));
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '---') {
      lines[i] = divider;
    }
  }

  return lines.map(line => `\t${line}`).join('\n');
}

// TODO support returned streams (ctx.body = someHTTPStream.on('error', ctx.onerror).pipe(PassThrough()))
// TODO handle errors
function asyncToKoa(asyncFunction) {

  return function asyncRoute(ctx) {
    // eslint-disable-next-line no-invalid-this
    const result = asyncFunction.call(this, ctx);

    if (result && result.then) {
      return result.then(body => sendResponse(ctx, body));
    }

    return sendResponse(ctx, result);
  };
}

function sendResponse(ctx, body) {
  ctx.body = body;
}

function clearAinsiColors(str: string): string {
  // source: https://stackoverflow.com/questions/25245716/remove-all-ansi-colors-styles-from-strings

  // eslint-disable-next-line no-control-regex
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}
