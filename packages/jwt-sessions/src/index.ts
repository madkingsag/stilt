import util from 'util';
import type { InjectableIdentifier, TRunnable, Factory } from '@stilt/core';
import { App, factory, isRunnable, runnable } from '@stilt/core';
import { StiltHttp, makeControllerInjector } from '@stilt/http';
import jwt from 'jsonwebtoken';
import type { Options as KoaJwtOptions } from 'koa-jwt';
import koaJwt from 'koa-jwt';
import cloneDeep from 'lodash/cloneDeep.js';

// TODO support secret, audience, issuer, etc from koa-jwt
// TODO custom write / read token settings (note: could have a writer/reader and cookie/Auth reader/writers by default)
// TODO cookie creation options

const theSecret = Symbol('secret');

type Config = {
  useCookies?: boolean | string,
} & Omit<KoaJwtOptions, 'cookie'>;

type IdentifierConfig = {
  /**
   * If specified, defines the key to use to inject this module dependency.
   * Defaults to 'stilt-graphql'
   */
  identifier?: string,

  /**
   * If true, the StiltGraphQl class will be usable as identifier to inject this module as a dependency,
   */
  defaultModule?: boolean,
};

export class StiltJwtSessions {

  static configure(config: Config | TRunnable<Config>, identifierConfig?: IdentifierConfig): Factory<StiltJwtSessions> {

    const getConfig: TRunnable<Config> = isRunnable(config) ? config : runnable(() => config);

    const identifiers: InjectableIdentifier[] = [
      identifierConfig?.identifier ?? 'stilt-jwt',
    ];

    if (identifierConfig?.defaultModule ?? true) {
      identifiers.push(StiltJwtSessions);
    }

    return factory({
      ids: identifiers,
      // Extra modules being registered by this factory. They must be declared before the end of the constructor.
      // The value can be a promise if the initialisation is async
      build: runnable(async (app: App, stiltHttp: StiltHttp, resolvedConfig: Config) => {
        return new StiltJwtSessions(app, stiltHttp, resolvedConfig, theSecret);
      }, [App, StiltHttp, getConfig]),
    });
  }

  private readonly stiltHttp: StiltHttp;
  private readonly contextKey: string;

  constructor(_app: App, stiltHttp: StiltHttp, config: Config, secret: Symbol) {
    if (secret !== theSecret) {
      throw new Error('You\'re trying to instantiate StiltJwtSessions incorrectly.\n'
        + '=> If you\'re trying to instantiate it by doing new StiltJwtSessions(), call StiltJwtSessions.configure(config) & pass the returned module to App.use instead.\n'
        + '=> If you\'re injecting this module through @Inject or similar, make sure this module was registered through App.use(StiltJwtSessions.configure(config))');
    }

    this.stiltHttp = stiltHttp;

    const { useCookies, key = 'session-jwt', ...passDown } = config;

    this.contextKey = key;

    const cookieName = useCookies ? (
      typeof useCookies === 'string'
        ? useCookies
        : 'jwtSession'
    ) : null;

    const koa = stiltHttp.koa;

    koa.use(koaJwt({
      secret: config.secret,
      passthrough: true,
      cookie: cookieName || null,
      key,
      ...passDown,
    }));

    koa.use((ctx, next) => {
      const session = this.getSessionFromContext(ctx);

      // copy the session to be able to compare with mutable session
      const sessionCopy = cloneDeep(session);

      return next().then(() => {
        const newSession = this.getSessionFromContext(ctx);

        // check if mutable session has changed.
        if (!util.isDeepStrictEqual(newSession, sessionCopy)) {
          const encodedSession = jwt.sign(newSession, config.secret);

          if (useCookies) {
            ctx.response.set('Set-Cookie', `${cookieName}=${encodedSession}`);
          } else {
            ctx.response.set('X-Set-Authorization', `Bearer ${encodedSession}`);
          }
        }
      });
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

    if (!ctx.state[this.contextKey]) {
      ctx.state[this.contextKey] = {};
    }

    return ctx.state[this.contextKey];
  }

  /**
   * @returns the session of the current context. Null if no context exists.
   */
  getCurrentSession() {
    const context = this.stiltHttp.getCurrentContext();

    if (context == null) {
      return null;
    }

    return this.getSessionFromContext(context);
  }
}

type WithSessionOptions = {
  key?: string,
};

const withSession = makeControllerInjector({
  dependencies: [StiltJwtSessions],
  run([options]: [options?: WithSessionOptions], [provider]: [StiltJwtSessions]) {
    return ({ [options?.key ?? 'session']: provider.getCurrentSession() });
  },
});

export {
  withSession,
  withSession as WithSession,
};
