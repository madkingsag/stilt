// @flow

const initMetaMap = new WeakMap();

export default class DependencyInjector {

  // we use an object instead of a map so people can declare getters.
  _moduleMap = Object.create(null);
  _instanceCache = new WeakMap();

  registerAll(map: { [string | Symbol]: Promise<Function> | Function }) {
    const descriptors = Object.getOwnPropertyDescriptors(map);

    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key];

      if (Object.prototype.hasOwnProperty.call(this._moduleMap, key)) {
        throw new Error(`Dependency ${JSON.stringify(String(key))} has been registered twice.`);
      }

      Object.defineProperty(this._moduleMap, key, descriptor);
    }
  }

  async getInstance(Class: Function | string | Symbol) {
    const type = typeof Class;

    if (type === 'string' || type === 'symbol') {
      const dependencyName = Class;
      Class = await this._moduleMap[Class];

      if (Class == null) {
        throw new Error(`Cannot instanciate dependency ${JSON.stringify(String(dependencyName))}: It has not been registered`);
      }
    }

    const cache = this._instanceCache.get(Class);
    if (cache) {
      return cache;
    }

    // we already have an instance instead of a function. Let's not instanciate it.
    if (typeof Class !== 'function') {
      this._instanceCache.set(Class, Class);

      return Class;
    }

    const instancePromise = this._createInstance(Class);

    this._instanceCache.set(Class, instancePromise);

    return instancePromise;
  }

  async _createInstance(Class: Function) {

    const initMeta = initMetaMap.get(Class) || {};

    const constructorArgs = [];

    if (initMeta.dependencies) {
      const dependencies = Object.create(null);
      const promises = [];

      for (const [key, dependency] of Object.entries(initMeta.dependencies)) {
        const promise = this.getInstance(dependency)
          .then(dependencyInstance => {
            dependencies[key] = dependencyInstance;
          });

        promises.push(promise);
      }

      await Promise.all(promises);
      constructorArgs.push(dependencies);
    }

    let instance;
    if (initMeta.asyncModuleInit) {
      instance = await Class[initMeta.asyncModuleInit](...constructorArgs);
    } else {
      instance = new Class(...constructorArgs);
    }

    return instance;
  }
}

export function Inject(dependencies) {

  return function decorate(Class) {
    if (!initMetaMap.has(Class)) {
      initMetaMap.set(Class, {});
    }

    const initMeta = initMetaMap.get(Class);
    initMeta.dependencies = initMeta.dependencies || Object.create(null);

    Object.assign(initMeta.dependencies, dependencies);
  };
}

export function AsyncModuleInit(Class, methodName) {

  if (!Class) {
    return AsyncModuleInit;
  }

  if (!initMetaMap.has(Class)) {
    initMetaMap.set(Class, {});
  }

  const initMeta = initMetaMap.get(Class);
  if (initMeta.asyncModuleInit) {
    throw new Error(`@AsyncModuleInit has been defined twice on ${Class.name}: [${initMeta.asyncModuleInit}, ${methodName}]`);
  }

  initMeta.asyncModuleInit = methodName;
}
