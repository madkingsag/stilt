// @flow

import type StiltJwt from '.';

export const ISessionProvider = Symbol('session-provider');

export class SessionProvider {
  constructor(stiltJwt: StiltJwt) {
    this.stiltJwt = stiltJwt;
  }

  getCurrentSession() {
    return this.stiltJwt.getCurrentSession();
  }
}
