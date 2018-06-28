// @flow

import { AsyncHookMap } from 'async-hooks-storage';

const currentInstances = new AsyncHookMap();

function setCurrentInstance(jwtModule) {
  currentInstances.set('instance', jwtModule);
}

function getCurrentSession() {
  const currentJwtModule = currentInstances.get('instance');
  if (!currentJwtModule) {
    return null;
  }

  return currentJwtModule.getCurrentSession();
}

function withSession(parameterOffset, key = 'session') {
  return function decorate(Class, propertyName, propertyDescriptor) {

    const oldFunction = propertyDescriptor.value;

    propertyDescriptor.value = function injectSession(...params) {

      if (typeof params[parameterOffset] !== 'object' || params[parameterOffset] == null) {
        params[parameterOffset] = {};
      }

      params[parameterOffset][key] = getCurrentSession();

      return oldFunction.apply(this, params);
    };

    Object.defineProperty(Class, propertyName, propertyDescriptor);

    return Class;
  };
}

export {
  withSession,
  withSession as WithSession,

  setCurrentInstance,
};
