// @flow

import { makeControllerInjector } from '@stilt/http';
import { ISessionProvider } from './SessionProvider';

const withSession = makeControllerInjector({
  run: (options, [provider]) => {
    return ({ [options.key || 'session']: provider.getCurrentSession() });
  },
  dependencies: [ISessionProvider],
});

export {
  withSession,
  withSession as WithSession,
};
