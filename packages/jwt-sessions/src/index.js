// @flow

import util from 'util';
import { cloneDeep } from 'lodash';
import StiltHttp from '@stilt/http';
import koaJwt from 'koa-jwt';
import jwt from 'jsonwebtoken';
import { setCurrentInstance } from './decorators';
import SessionProvider from './SessionProvider';

// TODO support secret, audience, issuer, etc from koa-jwt
// TODO custom write / read token settings (note: could have a writer/reader and cookie/Auth reader/writers by default)
// TODO cookie creation options

export { withSession, WithSession } from './decorators';

type Config = {
  secret: string,
  useCookies?: boolean | string,
};

export const ISessionProvider = Symbol('session-provider');
export type { SessionProvider };

export default class StiltJwtSessions {

  static MODULE_IDENTIFIER = Symbol('@stilt/jwt-sessions');
  _ctxKey = Symbol('@stilt/jwt-session');

  _config: Config;

  constructor(config: Config) {
    this._config = Object.assign({}, config);

    if (this._config.useCookies) {
      this._cookieName = typeof this._config.useCookies === 'string'
        ? this._config.useCookies
        : 'jwtSession';
    }
  }

  init(app) {
    const httpModule = app.getPlugin(StiltHttp.MODULE_IDENTIFIER);
    this._httpModule = httpModule;
    const koa = httpModule.koa;

    koa.use(koaJwt({
      key: this._ctxKey,
      secret: this._config.secret,
      passthrough: true,
      cookie: this._cookieName || null,
    }));

    koa.use((ctx, next) => {
      setCurrentInstance(this);

      const session = this.getSessionFromContext(ctx);

      // copy the session to be able to compare with mutable session
      const sessionCopy = cloneDeep(session);

      return next().then(() => {

        const newSession = this.getSessionFromContext(ctx);

        // check if mutable session has changed.
        if (!util.isDeepStrictEqual(newSession, sessionCopy)) {
          const encodedSession = jwt.sign(newSession, this._config.secret);

          if (this._config.useCookies) {
            ctx.response.set('Set-Cookie', `${this._cookieName}=${encodedSession}`);
          } else {
            ctx.response.set('X-Set-Authorization', `Bearer ${encodedSession}`);
          }
        }
      });
    });

    app.registerInjectables({
      [ISessionProvider]: new SessionProvider(this),
    });
  }

  /**
   * Returns the JWT session of a given context.
   *
   * @param ctx - A Koa Context Object.
   * @returns the context.
   */
  getSessionFromContext(ctx) {
    if (!ctx.state) {
      ctx.state = {};
    }

    if (!ctx.state[this._ctxKey]) {
      ctx.state[this._ctxKey] = {};
    }

    return ctx.state[this._ctxKey];
  }

  /**
   * @returns the session of the current context. Null if no context exists.
   */
  getCurrentSession() {
    const context = this._httpModule.getCurrentContext();

    if (context == null) {
      return null;
    }

    return this.getSessionFromContext(context);
  }
}
