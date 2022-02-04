import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { App } from '@stilt/core';
import { makeControllerInjector, StiltHttp } from '@stilt/http';
import { StiltJwtSessions } from '@stilt/jwt-sessions';
import getPort from 'get-port';
import { createClient } from 'graphql-ws';
import fetch from 'node-fetch';
import ws from 'ws';
import { StiltGraphQl, OnSubscription, Query } from '../src/index.js';

async function buildSimpleApp(): Promise<[app: App, port: number]> {
  const app = new App();

  const port = await getPort();
  await app.use(StiltHttp.configure({ port }));

  return [app, port];
}

class User {}

const WithViewer = makeControllerInjector<[], { http: StiltHttp }>({
  dependencies: {
    http: StiltHttp,
  },
  async run(_ignore, { http }) {
    const context = http.getCurrentContext();
    assert(context != null, 'context is nullish!');

    return { viewer: new User() };
  },
});

describe('Resolvers', () => {
  it('supports custom controller injectors', async () => {
    class MyResolver {
      @WithViewer(0)
      @Query('comment')
      getComment(params: { viewer: User }) {
        assert(params.viewer != null, 'viewer should not be null when using @Query');

        return { content: 'The comment' };
      }
    }

    const [app, port] = await buildSimpleApp();
    await app.use(StiltGraphQl.configure({
      resolversGlob: false,
      typeDefsGlob: false,
      resolvers: [MyResolver],
      typeDefs: [`
        type Query {
          comment: Comment!
        }

        type Comment {
          content: String!
        }
      `],
    }));

    await app.start();

    const res = await fetch(`http://localhost:${port}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query {
            comment { content }
          }
        `,
      }),
    });

    const body = await res.json();

    expect(body).toMatchSnapshot();

    await app.close();
  });
});

describe('Subscriptions', () => {
  it('supports creating a Subscription handler with @OnSubscription', async () => {
    class MyResolver {
      @OnSubscription('newComment')
      async *onSubscriptionToNewComment() {
        yield { content: 'first comment' };
        yield { content: 'second comment' };
      }
    }

    const [app, port] = await buildSimpleApp();
    await app.use(StiltGraphQl.configure({
      resolversGlob: false,
      typeDefsGlob: false,
      resolvers: [MyResolver],
      typeDefs: [`
        type Query {
          dummy: Boolean
        }

        type Comment {
          content: String!
        }

        type Subscription {
          newComment: Comment!
        }
      `],
    }));

    await app.start();

    const results = await collectSubscription(port, undefined, `subscription { newComment { content } }`);
    expect(results).toMatchSnapshot();

    await app.close();
  });

  it('supports custom controller injectors', async () => {
    class MyResolver {
      @WithViewer(0)
      @OnSubscription('newComment')
      async *onSubscriptionToNewComment(params: { viewer: User }) {
        assert(params.viewer != null, 'viewer should not be null when using @OnSubscription');

        yield { content: 'first comment' };
        yield { content: 'second comment' };
      }
    }

    const [app, port] = await buildSimpleApp();
    await app.use(StiltGraphQl.configure({
      resolversGlob: false,
      typeDefsGlob: false,
      resolvers: [MyResolver],
      typeDefs: [`
        type Query {
          dummy: Boolean
        }

        type Comment {
          content: String!
        }

        type Subscription {
          newComment: Comment!
        }
      `],
    }));

    await app.start();

    const results = await collectSubscription(port, undefined, `subscription { newComment { content } }`);
    expect(results).toMatchSnapshot();

    await app.close();
  });

  it('integrates with @stilt/jwt-sessions', async () => {
    const WithSession = makeControllerInjector<[], { jwt: StiltJwtSessions }>({
      dependencies: {
        jwt: StiltJwtSessions,
      },
      async run(_ignore, { jwt }) {
        const session = await jwt.getCurrentSession();

        assert(session != null, 'session is nullish!');
        // @ts-expect-error
        assert(session.sub != null, 'session should not be empty');

        return { session };
      },
    });

    class MyResolver {
      @WithSession(0)
      @OnSubscription('newComment')
      async *onSubscriptionToNewComment() {
        yield { content: 'first comment' };
      }
    }

    const [app, port] = await buildSimpleApp();
    await app.use(StiltJwtSessions.configure({
      secret: 'my-unsafe-secret',
    }));

    await app.use(StiltGraphQl.configure({
      resolversGlob: false,
      typeDefsGlob: false,
      resolvers: [MyResolver],
      typeDefs: [`
        type Query {
          dummy: Boolean
        }

        type Comment {
          content: String!
        }

        type Subscription {
          newComment: Comment!
        }
      `],
    }));

    await app.start();

    const results = await collectSubscription(port, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0NyJ9.xUE5hP52MUMkSC_tZtTShHKitdVqPufywVc7aQMEdNg', `subscription { newComment { content } }`);
    expect(results).toMatchSnapshot();

    await app.close();
  });
});

async function collectSubscription(port: number, authToken: string, query: string) {
  const client = createClient({
    url: `ws://localhost:${port}/graphql`,
    webSocketImpl: ws,
    generateID: () => crypto.randomUUID(),
    connectionParams: { authToken },
  });

  return new Promise((resolve, reject) => {
    const collected = [];

    client.subscribe({ query }, {
      error(error) {
        reject(error);
      },
      complete() {
        resolve(collected);
      },
      next(value) {
        collected.push(value);
      },
    });
  });
}
