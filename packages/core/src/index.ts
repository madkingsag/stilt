import {
  asyncGlob,
} from '@stilt/util';
import Emittery from 'emittery';
import DependencyInjector, { TInstantiable } from './dependency-injector';
import { Factory } from './factory';
import { TOptionalLazy } from './lazy';
import { TRunnable } from './runnables';
import { Class, InjectableIdentifier } from './typing';

export {
  AsyncModuleInit,
  Inject,
  Inject as inject,
  AsyncModuleInit as asyncModuleInit,
} from './dependency-injector';
export { runnable, TRunnable, isRunnable } from './runnables';
export { factory, Factory, isFactory } from './factory';
export { InjectableIdentifier } from './typing';
export { lazy } from './lazy';

export type Logger = Console;

type Config = {
  cwd?: string,
  logLevel?: string,
};

enum LifecycleEvents {
  START = 'start',
  CLOSE = 'close',
}

export class App {

  static LifecycleEvents = LifecycleEvents;

  public readonly lifecycle = new Emittery();

  private _dependencyInjector = new DependencyInjector();

  // private _injectablesGlob;

  constructor(config: Config = {}) {
    asyncGlob.cwd = config.cwd;

    // const defaultLogLevel = config.logLevel || 'info';
    // this.logger = this.makeLogger('core', { logLevel: defaultLogLevel });

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

  async executeRunnable<Return>(runnable: TRunnable<Return>): Promise<Return> {
    return this._dependencyInjector.executeRunnable(runnable);
  }

  use<T>(module: InjectableIdentifier | Factory<T>): Promise<T> {
    // @ts-ignore
    return this.instantiate(module);
  }

  register<T>(moduleFactory: Factory<T>): void {
    this._dependencyInjector.registerFactory(moduleFactory);
  }

  registerInstance(identifier, instance) {
    return this._dependencyInjector.registerInstance(identifier, instance);
  }

  instantiate<T>(runnable: TOptionalLazy<TInstantiable<T>>): Promise<T>;
  instantiate<T>(moduleArray: Array<TOptionalLazy<TInstantiable<T>>>): Promise<T[]>;
  instantiate<T>(moduleMap: { [key: string]: TOptionalLazy<TInstantiable<T>> }): Promise<{ [key: string]: T }>;
  instantiate<T>(moduleFactory: TOptionalLazy<TInstantiable<T>>
    | Array<TOptionalLazy<TInstantiable<T>>>
    | { [key: string]: TOptionalLazy<TInstantiable<T>> }): Promise<T | T[] | { [key: string]: T }> {
    // @ts-ignore
    return this._dependencyInjector.getInstances(moduleFactory);
  }

  static async createApp(
    InitModule: Class<any>,
    config: Config | null | undefined,
  ) {
    const app = new App(config);

    return app.instantiate(InitModule);
  }
}
