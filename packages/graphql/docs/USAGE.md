# @stilt/graphql

*GraphQL Adapter for Stilt Framework*

## Usage

In order to use `@stilt/graphql`, you will first need to install it and its dependencies:

`npm i @stilt/core @stilt/http @stilt/graphql`

```javascript
import App from '@stilt/core';
import StiltHttp from '@stilt/http';
import StiltGraphql from '@stilt/graphql';

const app = new App();

// Install HTTP server.
app.use(new StiltHttp({
  port: process.env.PORT || 8080,
}));

// Add GraphQL layer
app.use(new StiltGraphql({
  schema: `${__dirname}/schema`,
  resolvers: `${__dirname}/resolvers`,
}));
```

## Options

The `StiltGraphql` constructor takes multiples options:

### `schema`

- `schema` *(required)*: The directory containing the GraphQL schema definition.  
The definition can be provided either as `GraphQLSchema` JS objects (from the `graphql` npm package),
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

The directory can contain multiple files, each with their own schema. Those individual schemas will be merged together into one. (using [merge-graphql-schemas](https://github.com/okgrow/merge-graphql-schemas)).

**Note**: Two types, `Query` and `Mutation`, have special meaning: They correspond to the `query` and `mutation` keys of a `GraphQLSchema`. These two types will be merged together in the merged schema. Other, custom, types will not be merged together.

### `resolvers`

- `resolvers` *(required)*: The directory in which GraphQL schema resolvers are located. They must be JavaScript files containing a default export which is a class of resolvers.

Each resolver method must be static and be annotated with the `@resolve` decorator.

```javascript
// resolvers/ClientResolver.js

import { resolve } from '@stilt/graphql';

export default class ClientResolver {

  // resolve a mutation
  @resolve('Mutation.addClient')
  async addClient({ name, age }) {

    const client = await Client.create({ name, age });

    return client;
  }

  // resolve a Query
  @resolve('Mutation.clients')
  async addClient() {

    const client = await Client.findAll();

    return client;
  }

  // resolve an object property
  @resolve('Client.products')
  addClient({ client }) {

    return client.getAllProducts();
  }
}
```

**Note**:
- Resolvers receive all parameters declared in the schema as the first parameter.
- When resolving a property of a GraphQL type (eg. `Client.products`), the parent type is passed in the first parameter too using the name of the type as the key (eg. `client`).
- Resolvers may be async functions.
