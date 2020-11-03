import type { StiltHttp } from './stilt-http';

/**
 * @deprecated use {@link StiltHttp}
 */
export const IContextProvider = Symbol('context-provider');

/**
 * @deprecated use {@link StiltHttp}
 */
export class ContextProvider {
  private stiltHttp: StiltHttp;

  constructor(stiltHttp: StiltHttp) {
    this.stiltHttp = stiltHttp;
  }

  getCurrentContext() {
    return this.stiltHttp.getCurrentContext();
  }
}
