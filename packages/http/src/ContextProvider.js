// @flow

import type StiltHttp from './index';

export default class ContextProvider {
  constructor(stiltHttp: StiltHttp) {
    this.stiltHttp = stiltHttp;
  }

  getCurrentContext() {
    return this.stiltHttp.getCurrentContext();
  }
}
