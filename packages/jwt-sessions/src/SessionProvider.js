// @flow

import type StiltJwt from './index';

export default class SessionProvider {
  constructor(stiltJwt: StiltJwt) {
    this.stiltJwt = stiltJwt;
  }

  getCurrentSession() {
    return this.stiltJwt.getCurrentSession();
  }
}
