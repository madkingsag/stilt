import NodeUtil from 'node:util';
import type { InjectableIdentifier, TRunnable, Factory } from '@stilt/core';
import { App, factory, isRunnable, runnable } from '@stilt/core';
import type { THttpContext } from '@stilt/http';
import { StiltHttp, makeControllerInjector } from '@stilt/http';
import type { MaybePromise, MaybeArray } from '@stilt/util';
import type { SignOptions, VerifyOptions } from 'jsonwebtoken';
import jwt from 'jsonwebtoken';
import getJwtFromHeader from 'koa-jwt/lib/resolvers/auth-header.js';
import getJwtFromCookie from 'koa-jwt/lib/resolvers/cookie.js';
import cloneDeep from 'lodash/cloneDeep.js';

// TODO custom write / read token settings (note: could have a writer/reader and cookie/Auth reader/writers by default)
// TODO cookie creation options

const theSecret = Symbol('secret');
const LiveSessionKey = Symbol('live-session');
const ImmutableSessionKey = Symbol('immutable-session');

type GetSecret = () => MaybeArray<string | Buffer>;

type Config = {
  useCookies?: boolean | string,
  secret: MaybeArray<string | Buffer> | GetSecret,
  verifyOptions?: VerifyOptions,
  signOptions?: SignOptions,
  isRevoked?(ctx: THttpContext, token: object, tokenString: string): MaybePromise<boolean>,
  getToken?(ctx: THttpContext, opts: Config): string,
  debug?: typeof console.log | false,
};

type JwtDecoderOptions = Omit<Config, 'useCookies'> & { cookie: string | null };

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
  #options: JwtDecoderOptions;

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

  constructor(_app: App, stiltHttp: StiltHttp, config: Config, secret: Symbol) {
    if (secret !== theSecret) {
      throw new Error('You\'re trying to instantiate StiltJwtSessions incorrectly.\n'
        + '=> If you\'re trying to instantiate it by doing new StiltJwtSessions(), call StiltJwtSessions.configure(config) & pass the returned module to App.use instead.\n'
        + '=> If you\'re injecting this module through @Inject or similar, make sure this module was registered through App.use(StiltJwtSessions.configure(config))');
    }

    this.stiltHttp = stiltHttp;

    const { useCookies, ...passDown } = config;

    const cookieName = useCookies ? (
      typeof useCookies === 'string'
        ? useCookies
        : 'jwtSession'
    ) : null;

    const koa = stiltHttp.koa;

    this.#options = {
      cookie: cookieName || null,
      ...passDown,
    };

    koa.use(async (ctx, next) => {
      return next().then(() => {
        const liveSession = this.getSessionFromContext(ctx);

        // @ts-expect-error
        const sessionCopy = ctx[ImmutableSessionKey];

        // check if mutable session has changed & send new session through headers if it did.
        if (!NodeUtil.isDeepStrictEqual(liveSession, sessionCopy)) {
          const validSecrets = getSecrets(config.secret);

          const secretUsedForSigning = validSecrets.at(-1);
          const encodedSession = jwt.sign(liveSession, secretUsedForSigning);

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
  async getSessionFromContext(ctx: THttpContext): Promise<object | null> {
    // return cached version
    if (LiveSessionKey in ctx) {
      // @ts-expect-error
      return ctx[LiveSessionKey];
    }

    const session = await decodeJwt(ctx, this.#options);

    // @ts-expect-error
    ctx[LiveSessionKey] = session;

    // copy the session to be able to compare with mutable session
    // @ts-expect-error
    ctx[ImmutableSessionKey] = cloneDeep(session);

    return session;
  }

  /**
   * @returns the session of the current context. Null if no context exists.
   */
  async getCurrentSession(): Promise<object | null> {
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

const WithSession = makeControllerInjector({
  dependencies: [StiltJwtSessions],
  run([options]: [options?: WithSessionOptions], [provider]: [StiltJwtSessions]) {
    return ({ [options?.key ?? 'session']: provider.getCurrentSession() });
  },
});

export {
  WithSession,
};

function getSecrets(secret: Config['secret']): Array<string | Buffer> {
  if (typeof secret === 'function') {
    return getSecrets(secret());
  }

  if (!secret) {
    throw new Error('Secret not provided');
  }

  if (!Array.isArray(secret)) {
    return [secret];
  }

  return secret;
}

function getJwtFromContext(ctx) {
  return ctx.authToken;
}

async function decodeJwt(ctx: THttpContext, options: JwtDecoderOptions): Promise<object | null> {
  const tokenFinders = [getJwtFromContext, getJwtFromHeader, getJwtFromCookie];

  if (typeof options.getToken === 'function') {
    tokenFinders.unshift(options.getToken);
  }

  let token: string;
  for (const tokenFinder of tokenFinders) {
    const tmpToken = tokenFinder(ctx, options);

    if (tmpToken) {
      token = tmpToken;
      break;
    }
  }

  if (!token) {
    if (options.debug) {
      options.debug('No token found');
    }

    return null;
  }

  const validSecrets: Array<string | Buffer> = getSecrets(options.secret);

  let decodedToken;
  try {
    decodedToken = await verifyJwtManySecrets(token, validSecrets, options.verifyOptions);
  } catch (error) {
    if (options.debug) {
      options.debug('Failed to verify token', token, 'due to error', error, 'using secrets', validSecrets);
    }

    return null;
  }

  if (options.isRevoked) {
    const tokenRevoked = await options.isRevoked(
      ctx,
      decodedToken,
      token,
    );
    if (tokenRevoked) {
      if (options.debug) {
        options.debug('Token', decodedToken, token, 'is revoked');
      }

      return null;
    }
  }

  return decodedToken;
}

async function verifyJwtPromise(token: string, secret: string | Buffer, options: VerifyOptions) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, secret, options, (err, result) => {
      if (err) {
        return void reject(err);
      }

      resolve(result);
    });
  });
}

async function verifyJwtManySecrets(token: string, secrets: Array<string | Buffer>, options: VerifyOptions) {
  return Promise.any(secrets.map(async secret => {
    return verifyJwtPromise(token, secret, options);
  }));
}
