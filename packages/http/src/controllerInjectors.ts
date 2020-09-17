import type { App } from '@stilt/core';
import { isPlainObject } from '@stilt/util';

const CONTROLLER_INJECTORS = Symbol('controller-injector-meta');

type InjectorFactoryOptions<T> = {
  dependencies?: { [key: string]: string | Function | symbol } | Array<string | Function | symbol>,
  run: (parameters: T[], dependencies?: any[]) => { [key: string]: any },
};

type InjectorMeta<Arg> = {
  parameterNum: number,
  options: any,
  valueProvider: InjectorFactoryOptions<Arg>['run'],
  dependencies: InjectorFactoryOptions<Arg>['dependencies']
};

function addControllerInjector<T>(
  Class: Function,
  methodName: string,
  parameterNum,
  injector: InjectorFactoryOptions<T>,
  injectorParams: T[],
) {
  const injectorMeta = Class[CONTROLLER_INJECTORS] || new Map();
  Class[CONTROLLER_INJECTORS] = injectorMeta;

  if (!injectorMeta.has(methodName)) {
    Class[CONTROLLER_INJECTORS].set(methodName, []);
  }

  injectorMeta.get(methodName).push({
    parameterNum,
    options: injectorParams,
    valueProvider: injector.run,
    dependencies: injector.dependencies,
  });
}

export function makeControllerInjector<T>(injector: InjectorFactoryOptions<T>): Function {

  return function createConfiguredDecorator(parameterNum: number, ...injectorParameters: T[]): Function {

    return function decorateController(Class: Function, methodName: string) {
      addControllerInjector(Class, methodName, parameterNum, injector, injectorParameters);
    };
  };
}

function instantiateDependencyTable(stiltApp: App, table) {
  return stiltApp.instantiate(table);
}

export function wrapControllerWithInjectors(
  Class: Function,
  methodName: string,
  wrappedMethod: Function,
  stiltApp,
): Function {

  const injectorsMetaMap = Class[CONTROLLER_INJECTORS];
  if (!injectorsMetaMap || !injectorsMetaMap.has(methodName)) {
    return wrappedMethod;
  }

  const injectorsMetaList: Array<InjectorMeta<any>> = injectorsMetaMap
    .get(methodName)

    // get the instance of all declared dependencies.
    .map(injectorMeta => {
      if (!injectorMeta.dependencies) {
        return injectorMeta;
      }

      return {
        ...injectorMeta,
        dependenciesInstances: instantiateDependencyTable(stiltApp, injectorMeta.dependencies).catch(e => {
          const className = Class.name || Class.constructor.name;
          // TODO: add the name of the injector
          throw new Error(`Failed to build controller ${className}#${methodName} as the dependency of one of its injectors failed to build: \n ${e.message}`);
        }),
      };
    });

  return async function withInjectedParameters(...methodParameters) {

    const promises = [];
    for (let i = 0; i < injectorsMetaList.length; i++) {
      promises.push(injectParameter(methodParameters, injectorsMetaList[i], Class, methodName));
    }

    await Promise.all(promises);

    // eslint-disable-next-line babel/no-invalid-this
    return wrappedMethod.apply(this, methodParameters);
  };
}

async function injectParameter(methodParameters, injectorMeta, Class, methodName) {

  const { parameterNum, options, valueProvider, dependenciesInstances } = injectorMeta;

  let parameter = methodParameters[parameterNum];

  if (parameter !== void 0 && !isPlainObject(parameter)) {
    // TODO: extract getName to @stilt/util
    throw new Error(`Trying to inject property inside parameter ${parameterNum} of method ${Class.name || Class.constructor.name}#${methodName}, but parameter already exists and is not a plain object. This is likely a conflict between two decorators.`);
  }

  if (parameter === void 0) {
    parameter = Object.create(null);
    methodParameters[parameterNum] = parameter;
  }

  const injectableValues = await valueProvider(options, await dependenciesInstances);
  if (!injectableValues) {
    return;
  }

  Object.assign(parameter, injectableValues);
}
