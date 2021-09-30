import {
  asyncGlob,
} from '@stilt/util';
import Emittery from 'emittery';
import createAnnotation, { getPropertyAnnotation } from './annotations.js';
import type { TInstantiable } from './dependency-injector';
import DependencyInjector from './dependency-injector.js';
import type { Factory } from './factory';
import type { TOptionalLazy } from './lazy';
import type { TRunnable } from './runnables';
import type { Class, InjectableIdentifier } from './typing';

export {
  AsyncModuleInit,
  Inject,
  Inject as inject,
  AsyncModuleInit as asyncModuleInit,
} from './dependency-injector.js';
export { runnable, TRunnable, isRunnable } from './runnables.js';
export { factory, Factory, isFactory } from './factory.js';
export { InjectableIdentifier } from './typing.js';
export { lazy } from './lazy.js';

export const AppEvents = Object.freeze({
  Start: createAnnotation('Start', ['method-instance']),
  Close: createAnnotation('Close', ['method-instance']),
});

export type Logger = Console;

type Config = {
  cwd?: string,
  logLevel?: string,
};

enum LifecycleEvents {
  Start = 'start',
  Close = 'close',
}

export class App {

  static LifecycleEvents = LifecycleEvents;

  public readonly lifecycle = new Emittery();

  private readonly _dependencyInjector = new DependencyInjector(newDependency => {
    this._onDependencyInstanciation(newDependency);
  });

  // private _injectablesGlob;

  constructor(config: Config = {}) {
    asyncGlob.cwd = config.cwd;

    // const defaultLogLevel = config.logLevel || 'info';
    // this.logger = this.makeLogger('core', { logLevel: defaultLogLevel });

    // make StiltApp injectable
    this._dependencyInjector.registerInstance(App, this);
  }

  /**
   * Register @AppEvents.Start & @AppEvents.Close listeners
   */
  private _onDependencyInstanciation(dependency: object) {
    const startListeners = Object.keys(getPropertyAnnotation(dependency, AppEvents.Start));
    for (const listenerKey of startListeners) {
      this.lifecycle.on(LifecycleEvents.Start, () => dependency[listenerKey]());
    }

    const closeListeners = Object.keys(getPropertyAnnotation(dependency, AppEvents.Close));
    for (const listenerKey of closeListeners) {
      this.lifecycle.on(LifecycleEvents.Close, () => dependency[listenerKey]());
    }
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
    await this.lifecycle.emit(LifecycleEvents.Start);
  }

  /**
   * Closes the application
   */
  async close() {
    await this.lifecycle.emit(LifecycleEvents.Close);
  }

  async executeRunnable<Return>(runnable: TRunnable<Return>): Promise<Return> {
    return this._dependencyInjector.executeRunnable(runnable);
  }

  async use<T>(module: InjectableIdentifier | Factory<T>): Promise<T> {
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
  async instantiate<T>(moduleFactory: TOptionalLazy<TInstantiable<T>>
    | Array<TOptionalLazy<TInstantiable<T>>>
    | { [key: string]: TOptionalLazy<TInstantiable<T>> }): Promise<T | T[] | { [key: string]: T }> {
    // @ts-expect-error
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
