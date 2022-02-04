import assert from 'assert/strict';
import crypto from 'crypto';
import { App } from '@stilt/core';
import { makeControllerInjector, StiltHttp } from '@stilt/http';
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

    const results = await collectSubscription(port, `subscription { newComment { content } }`);
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

    const results = await collectSubscription(port, `subscription { newComment { content } }`);
    expect(results).toMatchSnapshot();

    await app.close();
  });
});

async function collectSubscription(port: number, query: string) {
  const client = createClient({
    url: `ws://localhost:${port}/graphql`,
    webSocketImpl: ws,
    generateID: () => crypto.randomUUID(),
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
