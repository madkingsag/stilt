// @flow

import { makeControllerInjector } from '@stilt/http';
import { AsyncHookMap } from 'async-hooks-map';

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

const withSession = makeControllerInjector(() => getCurrentSession(), 'session');

export {
  withSession,
  withSession as WithSession,

  setCurrentInstance,
};
