import { makeControllerInjector } from '@stilt/http';
import StiltJwtSessions from '.';

type Options = {
  key?: string,
}

const withSession = makeControllerInjector({
  dependencies: [StiltJwtSessions],
  run([options]: [Options], [provider]: [StiltJwtSessions]) {
    return ({ [options?.key ?? 'session']: provider.getCurrentSession() });
  },
});

export {
  withSession,
  withSession as WithSession,
};
