# @stilt/graphql

*GraphQL Adapter for Stilt Framework*

## Usage

In order to use `@stilt/graphql`, you will first need to install it and its dependencies:

`npm i @stilt/core @stilt/http @stilt/graphql`

```javascript
import Stilt from '@stilt/core';
import StiltHttp from '@stilt/http';
import StiltGraphql from '@stilt/graphql';

const app = new Stilt();

// Install HTTP server.
app.use(new StiltHttp({
  port: process.env.PORT || 8080,
}));

// Add GraphQL layer
app.use(new StiltGraphql({
  // load any .schema.js or .graphqls file as being part of the schema
  schemas: '**/*.+(schema.js|graphqls)',
  resolvers: '**/*.resolver.js',
}));

app.init();
```

## Options

The `StiltGraphql` constructor takes multiples options:

### `schema`

- `schema` *(optional, default: `'**/*.+(schema.js|graphqls)'`)*: A [glob](https://en.wikipedia.org/wiki/Glob_(programming)) pattern defining which files should be treated as a part of the GraphQL Schema definition containing the GraphQL schema.
The definitions can be provided either as `GraphQLSchema` JS objects (from the `graphql` npm package),
or as `.graphqls` files containing the schema using the GraphQL language:

```graphql
# schema/Client.graphqls

type Client {
  id: ID!
  name: String
  age: Int
  products: [Product]
}

type Query {
  clients: [Client]
  client(id: ID!): Client
}

type Mutation {
  addClient(name: String!, age: Int!): Client
}
```

Each individual schema definition will be merged together into the main schema. (using [merge-graphql-schemas](https://github.com/okgrow/merge-graphql-schemas)).

**Note**: Two types, `Query` and `Mutation`, have special meaning: They correspond to the `query` and `mutation` keys of a `GraphQLSchema`. These two types will be merged together in the merged schema. Other, custom, types will not be merged together.

### `resolvers`

- `resolvers` *(optional, default: `'**/*.resolver.js'`)*:  A [glob](https://en.wikipedia.org/wiki/Glob_(programming)) pattern defining where GraphQL Resolvers are located. They must be JavaScript files containing a default export which is a class of resolvers.

Each resolver method must be annotated with the `@Resolve` decorator.

```javascript
// resolvers/ClientResolver.js

import { Resolve } from '@stilt/graphql';

export default class ClientResolver {

  // resolve a mutation
  @Resolve('Mutation.addClient')
  async addClient({ name, age }) {

    const client = await Client.create({ name, age });

    return client;
  }

  // resolve a Query
  @Resolve('Mutation.clients')
  async addClient() {

    const client = await Client.findAll();

    return client;
  }

  // resolve an object property
  @Resolve('Client.products')
  addClient({ client }) {

    return client.getAllProducts();
  }
}
```

**Note**:
- Resolvers receive all parameters declared in the schema as the first parameter.
- When resolving a property of a GraphQL type (eg. `Client.products`), the parent type is passed in the first parameter too using the name of the type as the key (eg. `client`).
- Resolvers may be async functions.
