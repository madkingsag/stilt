import type { App, InjectableIdentifier } from '@stilt/core';
import { isPlainObject } from '@stilt/util';

const CONTROLLER_INJECTORS = Symbol('controller-injector-meta');

type TInjectorDeps = any[] | { [key: string]: any };

type InjectorFactoryOptions<Params extends any[], Dependencies extends TInjectorDeps> = {
  dependencies?: { [k in keyof Dependencies]: InjectableIdentifier },
  run(
    /* runtime parameters */
    parameters: Params,
    /* dependencies declared in dependencies property */
    dependencies: Dependencies
  ): { [key: string]: any },
};

type InjectorMeta<Params extends any[], Dependencies extends TInjectorDeps> = {
  parameterNum: number,
  options: any,
  valueProvider: InjectorFactoryOptions<Params, Dependencies>['run'],
  dependencies: InjectorFactoryOptions<Params, Dependencies>['dependencies'],
};

function addControllerInjector<Params extends any[], Dependencies extends TInjectorDeps>(
  Class: Function,
  methodName: string,
  parameterNum,
  injector: InjectorFactoryOptions<Params, Dependencies>,
  injectorParams: Params,
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

export type TControllerInjector<T extends any[]> = (parameterPos: number, ...parameters: T) => MethodDecorator;

export function makeControllerInjector<
  Args extends any[],
  Deps extends TInjectorDeps,
>(injector: InjectorFactoryOptions<Args, Deps>): TControllerInjector<Args> {

  return function createConfiguredDecorator(parameterNum: number, ...injectorParameters: Args): MethodDecorator {

    return function decorateController(Class: Function, methodName: string) {
      addControllerInjector(Class, methodName, parameterNum, injector, injectorParameters);
    };
  };
}

async function instantiateDependencyTable(stiltApp: App, table) {
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

  const injectorsMetaList: Array<InjectorMeta<any, any>> = injectorsMetaMap
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

    // eslint-disable-next-line @typescript-eslint/no-invalid-this
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
