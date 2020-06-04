import type StiltHttp from '.';

export const IContextProvider = Symbol('context-provider');

export default class ContextProvider {
  private stiltHttp: StiltHttp;

  constructor(stiltHttp: StiltHttp) {
    this.stiltHttp = stiltHttp;
  }

  getCurrentContext() {
    return this.stiltHttp.getCurrentContext();
  }
}
