import { AsyncLocalStorage } from 'node:async_hooks';
import type { Server } from 'node:http';
import type { Factory, InjectableIdentifier, TRunnable } from '@stilt/core';
import { App, factory, isRunnable, runnable } from '@stilt/core';
import type { TDeferred } from '@stilt/util';
import { createDeferred } from '@stilt/util';
import chalk from 'chalk';
import ip from 'ip';
import Koa from 'koa';
import Router from 'koa-better-router'; // TODO: replace with @koa/router
import bodyParser from 'koa-bodyparser';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import { ContextProvider, IContextProvider } from './ContextProvider.js';

type Config = {
  port: number,
};

type IdentifierConfig = {
  identifier?: string,
  defaultModule?: boolean,
};

export type THttpContext = Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext, any>;

const contextAsyncStorage = new AsyncLocalStorage<THttpContext>();
const theSecret = Symbol('secret');

const WebSocketKey: unique symbol = Symbol('webSocket');

// TODO: @disableBodyParser decorator
class StiltHttp {

  static configure(config: Config | TRunnable<Config>, identifierConfig?: IdentifierConfig): Factory<StiltHttp> {
    const getConfig = isRunnable(config) ? config : runnable(() => config);

    const identifiers: InjectableIdentifier[] = [
      identifierConfig?.identifier ?? 'stilt-http',
    ];

    if (identifierConfig?.defaultModule ?? true) {
      identifiers.push(StiltHttp);
    }

    return factory({
      ids: identifiers,
      build: runnable((app, theConfig) => {
        return new StiltHttp(app, theConfig, theSecret);
      }, [App, getConfig]),
    });
  }

  readonly #declaredEndpoints: Array<{ name: string, path: string }> = [];
  private readonly port;
  public readonly koa: Koa;
  private readonly router;
  private readonly logger;
  private httpServer: Server | undefined;

  #startDeferred: TDeferred<void>;

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

    this.koa.use(async (ctx, next) => {
      return contextAsyncStorage.run(ctx, async () => {
        return next();
      });
    });

    app.registerInstance(IContextProvider, new ContextProvider(this));

    app.lifecycle.on('start', async () => this.start());
    app.lifecycle.on('close', async () => this.close());

    this.#startDeferred = createDeferred();
  }

  #webSockets: WebSocketServer[] = [];
  async startWebSocketServer(path: string): Promise<WebSocketServer> {
    // wait for server to have started
    await this.#startDeferred.promise;

    const ws = new WebSocketServer({
      path,
      server: this.httpServer,
    });

    ws.on('connection', (webSocket, request) => {
      const context = this.koa.createContext(request, null);
      // @ts-expect-error
      context[WebSocketKey] = webSocket;

      webSocket.on('message', () => {
        contextAsyncStorage.enterWith(context);
      });
    });

    this.#webSockets.push(ws);

    return ws;
  }

  async start() {
    this.koa.use(this.router.middleware());

    // TODO only listen plugin if a route is registered
    await new Promise<void>(resolve => {
      this.httpServer = this.koa.listen(this.port, () => {
        resolve();
      });
    });

    this.#startDeferred.resolve();

    this._printServerStarted(this.port);
  }

  async close(): Promise<void> {
    await Promise.all([
      this.#closeHttp(),
      this.#closeAllWs(),
    ]);
  }

  async #closeHttp() {
    return new Promise((resolve, reject) => {
      if (!this.httpServer) {
        resolve(false);

        return;
      }

      this.httpServer.close(err => {
        if (err) {
          reject(err);
        }

        resolve(true);
      });
    });
  }

  async #closeAllWs() {
    return Promise.all(this.#webSockets.map(async ws => {
      return this.#closeOneWs(ws);
    }));
  }

  async #closeOneWs(ws: WebSocketServer) {
    return new Promise<void>((resolve, reject) => {
      ws.close(err => {
        if (err) {
          reject(err);
        }

        resolve();
      });
    });
  }

  /**
   * @returns the context of the request that is currently being processed. Null if no request is being processed.
   */
  getCurrentContext(): THttpContext {
    return contextAsyncStorage.getStore();
  }

  /**
   * @returns the current websocket, or null if called outside of a websocket context
   */
  getCurrentWebSocket(): WebSocket | null {
    const context = this.getCurrentContext();

    // @ts-expect-error
    return context?.[WebSocketKey] ?? null;
  }

  /**
   * Registers a new route on the HTTP server.
   *
   * @param method The HTTP method that may be used.
   * @param path The path part of the URL on which the route is.
   * @param callback The method handling the route.
   */
  registerRoute(method: string, path: string, callback) {
    // TODO: add "accept" option (array)
    // TODO: throw if a route has already been defined for a given method+path+accept
    const asyncCallback = asyncToKoa(callback);

    this.router[method](path, asyncCallback);
  }

  /**
   * Add an endpoint of interest when printing server started log
   */
  declareEndpoint(endpointName, endpointPath) {
    this.#declaredEndpoints.push({ name: endpointName, path: endpointPath });
  }

  /**
   * @param port
   * @private
   */
  _printServerStarted(port) {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    chalk.enabled = true;

    const localhost = `http://localhost:${port}`;

    const lines = [
      chalk.bold('Access URLs:'),
      '---',
      ['Localhost', localhost],
      ['LAN', `http://${ip.address()}:${port}`],
      '---',
    ];

    if (this.#declaredEndpoints.length > 0) {
      for (const endpoint of this.#declaredEndpoints) {
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
  for (const line of lines) {
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
    // eslint-disable-next-line @typescript-eslint/no-invalid-this
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
  return str.replace(/[\u001B\u009B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

export { StiltHttp };
