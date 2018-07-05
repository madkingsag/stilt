// @flow

import { isPlainObject, hasOwnProperty } from '@stilt/util';

const CONTROLLER_INJECTORS = Symbol('controller-injector-meta');

export function makeControllerInjector(callback: Function, defaultKey: string): Function {

  if (!defaultKey) {
    throw new Error('When creating a controller injector, you should specify as which key the value is injected');
  }

  return function createConfiguredDecorator(parameterNum: number, options = {}): Function {

    const { key = defaultKey, ...injectableOptions } = options;

    return function decorateController(Class, methodName) {

      const injectorMeta = Class[CONTROLLER_INJECTORS] || new Map();
      Class[CONTROLLER_INJECTORS] = injectorMeta;

      if (!injectorMeta.has(methodName)) {
        Class[CONTROLLER_INJECTORS].set(methodName, []);
      }

      injectorMeta.get(methodName).push({
        parameterNum,
        key,
        options: injectableOptions,
        valueProvider: callback,
      });
    };
  };
}

export function wrapControllerWithInjectors(Class: Function, methodName: string, method: Function): Function {

  const injectorsMetaMap = Class[CONTROLLER_INJECTORS];
  if (!injectorsMetaMap) {
    return method;
  }

  const injectorsMeta: Array = injectorsMetaMap.get(methodName);
  if (!injectorsMeta) {
    return method;
  }

  const existingMethod = Class[methodName];
  return function withInjectedParameters(...methodParameters) {

    for (let i = 0; i < injectorsMeta.length; i++) {
      injectParameter(methodParameters, injectorsMeta[i]);
    }

    // eslint-disable-next-line no-invalid-this
    return existingMethod.apply(this, methodParameters, Class, methodName);
  };
}

async function injectParameter(methodParameters, injectorMeta, Class, methodName) {

  const { parameterNum, key, options, valueProvider } = injectorMeta;

  let parameter = methodParameters[parameterNum];

  if (parameter !== void 0 && !isPlainObject(parameter)) {
    throw new Error(`Trying to inject property ${key} inside parameter ${parameterNum} of method ${Class.name}#${methodName}, but parameter already exists and is not a plain object. This is likely a conflict between two decorators.`);
  }

  if (parameter === void 0) {
    parameter = Object.create(null);
  }

  const injectableValue = await valueProvider(options);

  if (hasOwnProperty(parameter, key)) {
    throw new Error(`Trying to inject property ${key} inside object parameter ${parameterNum} of method ${Class.name}#${methodName}, but such property already exists is the parameter.`);
  }

  parameter[key] = injectableValue;
  methodParameters[parameterNum] = parameter;
}
