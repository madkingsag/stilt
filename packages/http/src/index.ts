import { AsyncLocalStorage } from 'async_hooks';
import { App, isRunnable, factory, runnable, Runnable, InjectableIdentifier } from '@stilt/core';
import Koa from 'koa';
import Router from 'koa-better-router';
import bodyParser from 'koa-bodyparser';
import ip from 'ip';
import chalk from 'chalk';
import ContextProvider, { IContextProvider } from './ContextProvider';

export { makeControllerInjector } from './controllerInjectors';
export { WithContext, withContext } from './WithContext';

export { IContextProvider };

type Config = {
  port: number,
}

type IdentifierConfig = {
  identifier?: string,
  defaultModule?: boolean,
};

const contextAsyncStorage = new AsyncLocalStorage();
const theSecret = Symbol('secret');

// TODO: @disableBodyParser decorator

export default class StiltHttp {

  static configure(config: Config | Runnable<Config>, identifierConfig?: IdentifierConfig) {
    const getConfig = isRunnable(config) ? config : runnable(() => config);

    const identifiers: Array<InjectableIdentifier> = [
      identifierConfig?.identifier ?? 'stilt-http',
    ];

    if (identifierConfig.defaultModule ?? true) {
      identifiers.push(StiltHttp);
    }

    return factory({
      ids: identifiers,
      build: runnable((app, theConfig) => {
        return new StiltHttp(app, theConfig, theSecret);
      }, [App, getConfig]),
    });
  }

  private _declaredEndpoints = [];
  private port;
  private koa;
  private router;
  private logger;
  private httpServer;

  constructor(app: App, config: Config, secret: Symbol) {
    if (secret !== theSecret) {
      throw new Error('Do not instantiate StiltHttp yourself, use StiltHttp.configure()');
    }

    this.port = config.port;

    this.koa = new Koa();

    // TODO only run bodyParser if body is requested by method (eg @BodyParams in rest)
    this.koa.use(bodyParser());

    this.router = Router().loadMethods();

    this.logger = app.makeLogger('http');

    this.koa.use((ctx, next) => {
      return contextAsyncStorage.run(ctx, () => {
        return next();
      });
    });

    // TODO: drop ContextProvider, provide StiltHttp instead
    app.registerInstance(IContextProvider, new ContextProvider(this));

    app.lifecycle.on('start', () => this.start());
    app.lifecycle.on('close', () => this.close());
  }

  async start() {
    this.koa.use(this.router.middleware());

    // TODO only listen plugin if a route is registered
    await new Promise((resolve, reject) => {
      this.httpServer = this.koa.listen(this.port, (err, val) => {
        if (err) {
          return void reject(err);
        }

        resolve(val);
      });
    });

    this._printServerStarted(this.port);
  }

  close() {
    return new Promise((resolve, reject) => {
      if (!this.httpServer) {
        return void resolve(false);
      }

      this.httpServer.close(err => {
        if (err) {
          reject(err);
        }

        resolve(true);
      });
    });
  }

  /**
   * @returns the context of the request that is currently being processed. Null if no request is being processed.
   */
  getCurrentContext() {
    return contextAsyncStorage.getStore();
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
    // eslint-disable-next-line babel/no-invalid-this
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
