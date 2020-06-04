import {
  asyncGlob,
} from '@stilt/util';
import DependencyInjector from './dependency-injector';
import { Class, InjectableIdentifier } from './typing';
import { Runnable } from './runnables';
import { AsyncEventEmitter } from './async-event-emitter';
import { Factory } from './factory';

export {
  AsyncModuleInit,
  Inject,
  Inject as inject,
  AsyncModuleInit as asyncModuleInit,
} from './dependency-injector';
export { runnable, Runnable, isRunnable } from './runnables';
export { factory, Factory, isFactory } from './factory';
export { InjectableIdentifier } from './typing';

export type Logger = Console;

type Config = {
  cwd?: string,
  logLevel?: string,
  // injectables?: string,
};

enum LifecycleEvents {
  START = 'start',
  CLOSE = 'close',
}

// TODO:
// - replace module.init with asyncInit if it's a class, or with async runnable if factory

export class App {

  static LifecycleEvents = LifecycleEvents;

  lifecycle = new AsyncEventEmitter();
  logger: Logger;

  private _dependencyInjector = new DependencyInjector();
  // private _injectablesGlob;

  constructor(config: Config = {}) {
    asyncGlob.cwd = config.cwd;

    const defaultLogLevel = config.logLevel || 'info';

    this.logger = this.makeLogger('core', { logLevel: defaultLogLevel });
    // this._injectablesGlob = config.injectables || '**/*.injectable.js';

    // make StiltApp injectable
    this._dependencyInjector.registerInstance(App, this);
  }

  makeLogger(_namespace: string, _config?: any) {
    // TODO use actual logger & namespace it.
    return console;
  }

  /**
   * Starts the application.
   */
  async start() {
    // await this._findInjectables();
    await this.lifecycle.emit(LifecycleEvents.START);
  }

  /**
   * Closes the application
   */
  async close() {
    await this.lifecycle.emit(LifecycleEvents.CLOSE);
  }

  // async _findInjectables() {
  //   const injectableFiles = await asyncGlob(this._injectablesGlob);
  //
  //   const declarations = injectableFiles.map(file => {
  //     const module = require(file);
  //     if (module.default) {
  //       return module.default();
  //     }
  //
  //     return module();
  //   });
  //
  //   for (const declaration of declarations) {
  //     this._dependencyInjector.registerModuleIds(declaration);
  //   }
  // }

  async executeRunnable<Return>(runnable: Runnable<Return>): Promise<Return> {
    return this._dependencyInjector.executeRunnable(runnable);
  }

  use(aClass: Class<any>) {
    return this.instantiate(aClass);
  }

  register<T>(moduleFactory: Factory<T>): void {
    this._dependencyInjector.registerFactory(moduleFactory);
  }

  registerInstance(identifier, instance) {
    return this._dependencyInjector.registerInstance(identifier, instance);
  }

  // registerInstances(map) {
  //   return this._dependencyInjector.registerModuleIds(map);
  // }

  instantiate<T>(classList: InjectableIdentifier): Promise<T>;
  instantiate<T>(classList: Array<InjectableIdentifier>): Promise<T[]>;
  instantiate<T>(classList: { [key: string]: InjectableIdentifier }): Promise<{ [key: string]: T }>;

  instantiate<T>(
    aClass: InjectableIdentifier | Array<InjectableIdentifier> | { [key: string]: InjectableIdentifier },
  ): Promise<T | T[] | { [key: string]: T }> {
    // @ts-ignore
    return this._dependencyInjector.getInstances(aClass);
  }

  static async createApp(
    InitModule: Class<any>,
    config: Config | null | undefined,
  ) {
    const app = new App(config);

    return app.instantiate(InitModule);
  }
}

// function getName(obj) {
//   return (obj && obj.constructor && obj.constructor.name) || String(obj);
// }

