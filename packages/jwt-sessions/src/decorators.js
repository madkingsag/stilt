// @flow

import { makeControllerInjector } from '@stilt/http';
import StiltJwtSessions from '.';

const withSession = makeControllerInjector({
  run: (options, [jwtSessions]) => {
    return ({ [options.key || 'session']: jwtSessions.getCurrentSession() });
  },
  dependencies: [StiltJwtSessions],
});

export {
  withSession,
  withSession as WithSession,
};
