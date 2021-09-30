import assert from 'assert';
import { awaitAllEntries, isPlainObject, mapObject } from '@stilt/util';
import type { Factory } from './factory';
import { isFactory } from './factory.js';
import type { TOptionalLazy } from './lazy';
import { isLazy } from './lazy.js';
import type { TRunnable } from './runnables';
import { isRunnable } from './runnables.js';
import type { Class, InjectableIdentifier } from './typing';

const initMetaMap = new WeakMap();

export type TInstantiable<T> = TRunnable<T> | Factory<T> | InjectableIdentifier;

export default class DependencyInjector {

  // we use an object instead of a map so people can declare getters.
  _moduleMap = Object.create(null);

  _idToFactoryMap = new Map<InjectableIdentifier, Factory<any> | Class<any>>();
  _idToInstanceMap = new Map<InjectableIdentifier | Factory<any>, any>();

  constructor(private readonly _onNewDepCallback) {
  }

  registerFactory(factory: Factory<any>) {
    for (const id of factory.ids) {
      if (this._idToFactoryMap.has(id) && this._idToFactoryMap.get(id) !== factory) {
        throw new Error(`The application is trying to register two different factories/modules for injectable ${String(id)} as the default instance for the class`);
      }

      this._idToFactoryMap.set(id, factory);
    }
  }

  /**
   * This method is used to register instances that have not been created by this dependency injector.
   */
  registerInstance<T>(identifier: InjectableIdentifier, instance: T) {
    if (this._idToInstanceMap.has(identifier) && this._idToInstanceMap.get(identifier) !== instance) {
      if (typeof identifier === 'function') {
        throw new Error(`The application is trying to register two different instances of Class ${identifier.name} as the default instance for the class`);
      }

      throw new Error(`The application is trying to register two different injectables using the same identifier ${String(identifier)}`);
    }

    this._idToInstanceMap.set(identifier, instance);
  }

  getInstances<T>(moduleFactory: TOptionalLazy<TInstantiable<T>>): Promise<T>;
  getInstances<T>(moduleArray: Array<TOptionalLazy<TInstantiable<T>>>): Promise<T[]>;
  getInstances<T>(moduleMap: {
    [key: string]: TOptionalLazy<TInstantiable<T>>,
  }): Promise<{ [key: string]: T }>;

  async getInstances<T>(
    // dependencies: MyService
    // dependencies: lazy(() => MyService)
    moduleFactory: TOptionalLazy<TInstantiable<T>>
      // dependencies: [MyService]
      // dependencies: [lazy(() => MyService)]
      | Array<TOptionalLazy<TInstantiable<T>>>
      // dependencies: { myService: MyService }
      // dependencies: { myService: lazy(() => MyService) }
      | { [key: string]: TOptionalLazy<TInstantiable<T>> },
  ): Promise<T | T[] | { [key: string]: T }> {
    return this._getInstances(moduleFactory, []);
  }

  async getInstance<T>(buildableModule: TOptionalLazy<TInstantiable<T>>): Promise<T> {
    return this._getInstance(buildableModule, []);
  }

  private async _getInstances<T>(
    moduleFactory: TOptionalLazy<TInstantiable<T>>
      | Array<TOptionalLazy<TInstantiable<T>>>
      | { [key: string]: TOptionalLazy<TInstantiable<T>> },
    dependencyChain: any[],
  ) {

    if (moduleFactory == null) {
      throw new Error(`getInstances: received parameter is null`);
    }

    // these are run first as they are POJOs with special logic
    if (isFactory(moduleFactory) || isRunnable(moduleFactory)) {
      return this._getInstance<T>(moduleFactory, dependencyChain);
    }

    if (Array.isArray(moduleFactory)) {
      return Promise.all(
        moduleFactory.map(async ClassItem => this._getInstance(ClassItem, dependencyChain)),
      );
    }

    if (typeof moduleFactory === 'object' && isPlainObject(moduleFactory)) {
      return awaitAllEntries(mapObject(moduleFactory, async (aClass: TOptionalLazy<TInstantiable<T>>, key: string) => {
        try {
          return await this._getInstance<T>(aClass, dependencyChain);
        } catch (e) {
          // TODO: use .causedBy
          throw new Error(`Failed to build ${key}: \n ${e.message}`);
        }
      }));
    }

    assert(typeof moduleFactory === 'function');

    return this._getInstance<T>(moduleFactory, dependencyChain);
  }

  private async _getInstance<T>(buildableModule: TOptionalLazy<TInstantiable<T>>, dependencyChain: any[]): Promise<T> {
    if (buildableModule == null) {
      // @ts-expect-error - Class must be either null or undefined, symbol won't be an issue
      throw new Error(`Trying to get instance of invalid module: ${buildableModule}`);
    }

    if (isLazy(buildableModule)) {
      buildableModule = buildableModule();
    }

    // runnables don't have IDs, we just run them with their requested dependencies every time we see them
    if (isRunnable(buildableModule)) {
      return this.executeRunnable(buildableModule, dependencyChain);
    }

    // this module has already been built, return old version
    if (this._idToInstanceMap.has(buildableModule)) {
      return this._idToInstanceMap.get(buildableModule);
    }

    // build the instance & register its ID

    const factory = isFactory(buildableModule)
      ? buildableModule
      : (this._idToFactoryMap.get(buildableModule) ?? buildableModule);

    if (typeof factory !== 'function' && !isFactory(factory)) {
      throw new Error(`Cannot instantiate dependency ${JSON.stringify(String(buildableModule))}: It has not been registered`);
    }

    // this module is still building, cyclic dependency
    if (dependencyChain.includes(buildableModule)) {
      throw new CyclicDependencyError([...dependencyChain, buildableModule]);
    }

    const newDependencyChain = [...dependencyChain, buildableModule];

    // TODO: if classIdentifier is a class or a factory, that it is not a key in _idToFactoryMap, but that a string/symbol key is and points to this factory,
    //   throw because it means it hasn't been registered as default, but has been registered named and that ID should be used instead.

    const instancePromise = isFactory(factory)
      ? this._createInstanceFactory(factory, newDependencyChain)
      : this._createInstanceClass(factory, newDependencyChain);

    // register aliases
    if (isFactory(factory)) {
      for (const id of factory.ids) {
        if (this._idToInstanceMap.has(id)) {
          throw new Error(`Factory tries to register ID ${String(id)}, but it has already been registered`);
        }

        this._idToInstanceMap.set(id, instancePromise);
      }
    }

    this._idToInstanceMap.set(factory, instancePromise);

    const instance = await instancePromise;

    if (this._onNewDepCallback) {
      this._onNewDepCallback(instance);
    }

    return instance;
  }

  private async _createInstanceFactory(factory: Factory<any>, dependencyChain: any[]) {
    return this.executeRunnable(factory.build, dependencyChain);
  }

  async executeRunnable<Return>(runnable: TRunnable<Return>, dependencyChain: any[] = []): Promise<Return> {
    const run = runnable.run;

    if (!runnable.dependencies) {
      return run();
    }

    let instances;
    try {
      instances = await this._getInstances(runnable.dependencies, dependencyChain);
    } catch (e) {
      // TODO use .causedBy
      throw new Error(`Error while instantiating a Runnable's dependencies: \n ${e.message}`);
    }

    if (Array.isArray(instances)) {
      return run(...instances);
    }

    return run(instances);
  }

  private async _createInstanceClass(aClass: Class<any>, dependencyChain: any[]) {

    const initMeta = initMetaMap.get(aClass) || {};

    const constructorArgs = [];

    if (initMeta.dependencies) {
      try {
        const dependencies = await this._getInstances(initMeta.dependencies, dependencyChain);
        constructorArgs.push(dependencies);
      } catch (e) {
        // TODO use .causedBy
        throw new Error(`Error while instantiating class ${aClass.name}'s dependencies: \n ${e.message}`);
      }
    }

    let instance;
    if (initMeta.asyncModuleInit) {
      instance = await aClass[initMeta.asyncModuleInit](...constructorArgs);
    } else {
      instance = new aClass(...constructorArgs);
    }

    return instance;
  }
}

export function Inject(dependencies) {

  return function decorate(aClass) {
    if (!initMetaMap.has(aClass)) {
      initMetaMap.set(aClass, {});
    }

    const initMeta = initMetaMap.get(aClass);
    initMeta.dependencies = initMeta.dependencies || Object.create(null);

    Object.assign(initMeta.dependencies, dependencies);
  };
}

export function AsyncModuleInit(
  aClass: Object,
  methodName: string | symbol,
  _descriptor: TypedPropertyDescriptor<any>,
): void {

  if (typeof aClass !== 'function') {
    throw new Error('@AsyncModuleInit can only be used on static class methods.');
  }

  if (!initMetaMap.has(aClass)) {
    initMetaMap.set(aClass, {});
  }

  const initMeta = initMetaMap.get(aClass);
  if (initMeta.asyncModuleInit) {
    throw new Error(`@AsyncModuleInit has been defined twice on ${aClass.name}: [${initMeta.asyncModuleInit}, ${String(methodName)}]`);
  }

  initMeta.asyncModuleInit = methodName;
}

class CyclicDependencyError extends Error {
  constructor(steps) {
    super(`Cyclic dependency detected: ${steps.map(step => getDepName(step)).join(' → ')}`);
  }
}

function getDepName(item) {
  if (typeof item === 'function' && item.constructor) {
    return item.name;
  }

  return String(item);
}
