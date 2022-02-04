# @stilt/graphql

*GraphQL Adapter for Stilt Framework*

## Usage

In order to use `@stilt/graphql`, you will first need to install it and its dependencies:

`npm i @stilt/core @stilt/http @stilt/graphql`

```typescript
import { App } from '@stilt/core';
import { StiltHttp } from '@stilt/http';
import { StiltGraphql } from '@stilt/graphql';

const app = new App();

// Install HTTP server.
await app.use(StiltHttp.configure({ port: process.env.PORT || 8080 }));

// Add GraphQL layer
await app.use(StiltGraphql.configure());

await app.start();
```

## Options

The `StiltGraphql` constructor takes multiples options:

### `typeDefs` & `typeDefsGlob`

The `typeDefsGlob` option accepts a [glob](https://en.wikipedia.org/wiki/Glob_(programming)) pattern defining which 
files should be used for the creation of the GraphQL schema.  
Default: `'**/*.+(schema.{js,mjs,cjs,ts,mts,cts}|graphqls)'`

The schema pieces can be provided either as `GraphQLSchema` objects:

```typescript
// product-type.schema.ts
import { GraphQLEnumType } from 'graphql';

export default new GraphQLEnumType({
  name: 'ProductType',
  values,
});
 ```

or as `.graphqls` files containing the schema using the GraphQL language:

```graphql
# client.graphqls

type Client {
  id: ID!
  name: String!
  age: Int!
  products: [Product!]!
}

type Query {
  clients: [Client!]!
}

type Mutation {
  addClient(name: String!, age: Int!): Client!
}
```

Each individual schema definition will be merged together into the main schema. (
using [merge-graphql-schemas](https://github.com/okgrow/merge-graphql-schemas)).

---

It is also possible to use `typeDefs` to pass these schema pieces directly to `StiltGraphQl` without using glob.

```typescript
import { GraphQLEnumType } from 'graphql';

app.use(new StiltGraphql({
  typeDefsGlob: false, // disabling glob is optional
  typeDefs: [
    new GraphQLEnumType({
      name: 'ProductType',
      values,
    }),
    `
    type Query {
      value: String
    }
    `
  ],
}));
```

---

**Note**: Three types, `Query`, `Mutation`, and `Subscription` have special meaning: They correspond to the `query`
, `mutation`, and `subscription` keys of a `GraphQLSchema`.   
These three types will be merged together in the merged schema. Other, custom, types will not be merged together.

### `resolvers` & `resolversGlob`

The `resolversGlob` option accepts a [glob](https://en.wikipedia.org/wiki/Glob_(programming)) pattern defining 
where GraphQL Resolvers are located. They must be JavaScript files exporting Resolver classes or objects.  
Default: `'**/*.resolver.{js,mjs,cjs,ts,mts,cts}'`

Example Resolver class:

```typescript
// client.resolver.ts

import { Resolve, Mutation, Query } from '@stilt/graphql';

export class ClientResolver {

  // resolve a mutation
  @Mutation('addClient')
  async addClient({ name, age }) {
    const client = await Client.create({ name, age });

    return client;
  }

  // resolve a Query
  @Query('clients')
  async getClients() {
    const client = await Client.findAll();

    return client;
  }

  // resolve an object property
  @Resolve('Client.products')
  getClientProduct({ client }) {
    return client.getAllProducts();
  }
}
```

---

It is also possible to use `resolvers` to pass these resolvers directly to `StiltGraphQl` without using glob.

```typescript
import { GraphQLEnumType } from 'graphql';
import { ClientResolver } from './client.resolver.js';

app.use(new StiltGraphql({
  resolversGlob: false, // disabling glob is optional
  resolvers: [ClientResolver],
}));
```

**Note**:

- Resolvers receive all parameters declared in the schema as the first parameter.
- When resolving a property of a GraphQL type (e.g. `Client.products`), the parent type is passed in the first parameter too
  using the name of the type as the key (e.g. `client`).

## Subscriptions

Subscriptions are supported and use `graphql-ws` under the hood.

Creating a new subscription handler is a simple as decorating a method with `@OnSubscription`, and making it return an async
iterable.

Example using `PubSub`:

```typescript
// message.resolver.ts

import { OnSubscription } from '@stilt/graphql';
import { PubSub } from 'graphql-subscriptions';

export default class MessageResolver {
  #pubSub = new PubSub();

  @OnSubscription('newMessage')
  onNewMessage() {
    return this.#pubsub.asyncIterator('new-message');
  }

  dispatchMessage(message) {
    this.#pubSub.publish('new-message', message);
  }
}
```

Example using Async Generators:

```typescript
// message.resolver.ts

import { EventEmitter } from 'node:events';
import { OnSubscription } from '@stilt/graphql';

export default class MessageResolver {
  #eventEmitter = new EventEmitter();

  @OnSubscription('newMessage')
  async* onNewMessage() {
    yield* EventEmitter.on(this.#eventEmitter, 'new-message');
  }

  dispatchMessage(message) {
    this.#eventEmitter.emit('new-message', message);
  }
}
```

### Authentication

It's not possible to pass Authentication Headers using websockets. Instead, `graphql-ws` proposes a `connectionParams`
option that you can use to pass an authentication token.

`@stilt/graphql` has built-in support for `@stilt/jwt-sessions`. If you pass your JWT token via
the `connectionParams.authToken` option, `StiltJwtSessions#getCurrentSession` will return the user's session. Just like if
you passed it through the `Authorization` header.

```typescript
// client side

import { createClient } from 'graphql-ws';
import ws from 'ws';

const client = createClient({
  url: `ws://localhost:3000/graphql`,
  webSocketImpl: ws,
  generateID: () => crypto.randomUUID(),
  connectionParams: {
    // this parameter must be named 'authToken'
    authToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0NyJ9.xUE5hP52MUMkSC_tZtTShHKitdVqPufywVc7aQMEdNg'
  },
});

// client.subscribe(...)
```

```typescript
// server side
// message.resolver.ts

import { EventEmitter } from 'node:events';
import { OnSubscription, DevError } from '@stilt/graphql';
import { makeControllerInjector } from '@stilt/http';
import { StiltJwtSessions } from '@stilt/jwt-sessions';
import UserService from './my-user-service.js';

// create an injector that will provide the Viewer to our Subscription handler
// (also works with Resolvers, and in rest)
export const WithViewer = makeControllerInjector<[], Dependencies>({
  dependencies: {
    userService: UserService,
    stiltJwt: StiltJwtSessions,
  },
  async run([options = {}], { userService, sessionProvider }) {
    // get Session from JWT
    const session = await stiltJwt.getCurrentSession();

    // get User entity that matches session (depends on your implementation)
    const viewer = await userService.getViewer(session);

    if (viewer == null) {
      throw new DevError('Authentication required');
    }

    return { viewer };
  },
});

export class MessageResolver {
  @WithViewer(0) // retrieve viewer from session & throw if it's not found
  @OnSubscription('newMessage')
  async* onNewMessage({ viewer }) {
    // viewer is now available

    // ... implementation not included
  }
}

```
