# @stilt/graphql

*GraphQL Adapter for Stilt Framework*

## Declaring Custom Scalars

Custom scalars are very useful for either custom formatting of a type (eg. `Date`) or stricter validation of inputs (`UUID`, `PositiveInteger`, see [Error Handling](ERRORS.md)).

GraphQL Scalars are extremely simple to declare in `@stilt/graphql`. First edit your configuration to include a new option `scalars`:

```javascript
app.use(new StiltGraphql({
  // ...
  scalars: `${__dirname}/scalars`,
}));
```

This option defines in which folder the framework will need to go fetch the declaration of your custom scalars.

The scalars folder should contain JavaScript files which export instances of `GraphQLScalarType`. Any export that is an instance of that class will be registered as a Scalar resolver and its Schema type will be automatically created.

Please read [The documentation on how to use GraphQLScalarType](https://graphql.org/graphql-js/type/) for more information.

## Example:

```javascript
// scalars/DateScalar.js

import { GraphQLScalarType, Kind } from 'graphql';

function parseDate(value) {
  if (typeof value !== 'string') {
    return void 0;
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return void 0;
  }

  return new Date(timestamp);
}

export default new GraphQLScalarType({

  // "name" defines under which name the scalar is usable in your schemas.
  name: 'Date',
  description: 'ISO 8601 Date type',
  parseValue: parseDate,
  serialize(value) {
    if (!(value instanceof Date)) {
      throw new Error('Trying to serialize graphql type "Date" but input is not a JS Date instance');
    }

    return value.toISOString();
  },
  parseLiteral(ast) {
    switch (ast.kind) {
      case Kind.INT:
        return Number(ast.value);

      case Kind.STRING:
        return parseDate(ast.value);

      default:
        return void 0;
    }
  },
});
```

You can then use the `Date` scalar in your schemas:

```graphqls
type Post {
  createdAt: Date!

  title: String!
  contents: String!
  author: User!
}
```
