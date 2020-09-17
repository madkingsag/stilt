import assert from 'assert';
import {
  awaitAllEntries,
  isPlainObject,
  mapObject,
} from '@stilt/util';
import { Factory, isFactory } from './factory';
import { TRunnable, isRunnable } from './runnables';
import { Class, InjectableIdentifier } from './typing';

const initMetaMap = new WeakMap();

export default class DependencyInjector {

  // we use an object instead of a map so people can declare getters.
  _moduleMap = Object.create(null);

  _idToFactoryMap = new Map<InjectableIdentifier, Factory<any> | Class<any>>();
  _idToInstanceMap = new Map<InjectableIdentifier | Factory<any>, any>();

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

  getInstances<T>(moduleFactory: Factory<T>): Promise<T>;
  getInstances<T>(runnable: TRunnable<T>): Promise<T>;
  getInstances<T>(moduleIdentifier: InjectableIdentifier): Promise<T>;
  getInstances<T>(moduleArray: Array<InjectableIdentifier | Factory<T> | TRunnable<T>>): Promise<T[]>;
  getInstances<T>(moduleMap: { [key: string]: InjectableIdentifier | Factory<T> | TRunnable<T> }): Promise<{ [key: string]: T }>;

  getInstances<T>(moduleFactory: Factory<T> | TRunnable<T> | InjectableIdentifier
    | Array<InjectableIdentifier | Factory<T> | TRunnable<T>>
    | { [key: string]: InjectableIdentifier | Factory<T> | TRunnable<T> }): Promise<T | T[] | { [key: string]: T }> {

    if (moduleFactory == null) {
      throw new Error(`getInstances: received parameter is null`);
    }

    // these are run first as they are POJOs with special logic
    if (isFactory(moduleFactory) || isRunnable(moduleFactory)) {
      return this.getInstance<T>(moduleFactory);
    }

    if (Array.isArray(moduleFactory)) {
      return Promise.all(
        moduleFactory.map(ClassItem => this.getInstance(ClassItem)),
      );
    }

    if (typeof moduleFactory === 'object' && isPlainObject(moduleFactory)) {
      return awaitAllEntries(
        mapObject(moduleFactory, async (ClassItem: Factory<T> | TRunnable<T> | InjectableIdentifier, key: string) => {
          try {
            return await this.getInstance<T>(ClassItem);
          } catch (e) {
            // TODO: use .causedBy
            throw new Error(`Failed to build ${key}: \n ${e.message}`);
          }
        }),
      );
    }

    assert(typeof moduleFactory === 'function');

    return this.getInstance<T>(moduleFactory);
  }

  async getInstance<T>(buildableModule: InjectableIdentifier | Factory<T> | TRunnable<T>): Promise<T> {
    if (buildableModule == null) {
      // @ts-ignore - Class must be either null or undefined, symbol won't be an issue
      throw new Error(`Trying to get instance of invalid module: ${buildableModule}`);
    }

    // runnables don't have IDs, we just run them with their requested dependencies every time we see them
    if (isRunnable(buildableModule)) {
      return this.executeRunnable(buildableModule);
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

    // TODO: if classIdentifier is a class or a factory, that it is not a key in _idToFactoryMap, but that a string/symbol key is and points to this factory,
    //   throw because it means it hasn't been registered as default, but has been registered named and that ID should be used instead.

    const instancePromise = isFactory(factory)
      ? this._createInstanceFactory(factory)
      : this._createInstanceClass(factory);

    if (isFactory(factory)) {
      for (const id of factory.ids) {
        if (this._idToInstanceMap.has(id)) {
          throw new Error(`Factory tries to register ID ${String(id)}, but it has already been registered`);
        }

        this._idToInstanceMap.set(id, instancePromise);
      }
    }

    this._idToInstanceMap.set(factory, instancePromise);

    return instancePromise;
  }

  async _createInstanceFactory(factory: Factory<any>) {
    return this.executeRunnable(factory.build);
  }

  async executeRunnable<Return>(runnable: TRunnable<Return>): Promise<Return> {
    const run = runnable.run;

    if (!runnable.dependencies) {
      return run();
    }

    let instances;
    try {
      instances = await this.getInstances(runnable.dependencies);
    } catch (e) {
      // TODO use .causedBy
      throw new Error(`Error while instantiating a Runnable's dependencies: \n ${e.message}`);
    }

    if (Array.isArray(instances)) {
      return run(...instances);
    }

    return run(instances);
  }

  async _createInstanceClass(aClass: Class<any>) {

    const initMeta = initMetaMap.get(aClass) || {};

    const constructorArgs = [];

    if (initMeta.dependencies) {
      try {
        const dependencies = await this.getInstances(initMeta.dependencies);
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

  // @ts-ignore - https://github.com/microsoft/TypeScript/issues/1863
  // registerModuleIds(map: { [key: string | symbol]: Promise<Class> | Class }) {
  //   const descriptors = Object.getOwnPropertyDescriptors(map);
  //
  //   for (const key of Reflect.ownKeys(descriptors)) {
  //     // @ts-ignore - https://github.com/microsoft/TypeScript/issues/1863
  //     const descriptor = descriptors[key];
  //
  //     if (Object.prototype.hasOwnProperty.call(this._moduleMap, key)) {
  //       throw new Error(`Dependency ${JSON.stringify(String(key))} has been registered twice.`);
  //     }
  //
  //     Object.defineProperty(this._moduleMap, key, descriptor);
  //   }
  // }
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

export function AsyncModuleInit(aClass, methodName) {

  if (!aClass) {
    return AsyncModuleInit;
  }

  if (!initMetaMap.has(aClass)) {
    initMetaMap.set(aClass, {});
  }

  const initMeta = initMetaMap.get(aClass);
  if (initMeta.asyncModuleInit) {
    throw new Error(`@AsyncModuleInit has been defined twice on ${aClass.name}: [${initMeta.asyncModuleInit}, ${methodName}]`);
  }

  initMeta.asyncModuleInit = methodName;
}
