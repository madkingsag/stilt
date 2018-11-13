# ROADMAP

## Resolvers

- `@resolveType`
- Check out options from https://github.com/apollographql/graphql-tools/blob/3b77c2071e4b2328b1a4c4471c61d4ad93a6ae57/src/makeExecutableSchema.ts#L85

- `@Query()` = `@Resolve('Query.x')`
- `@Mutation()` = `@Resolve('Mutation.x')`
- `@Resolve()`
- `@Subscription()`

- Resolvers should use the name of the method by default
  ```
  @Resolve()
  getAuthor() {}
  ```

## Custom Scalars

## Error Management

- Expose GraphQLError's UserError as "DeveloperError" (which goes to global errors instead of schema error).
- In development, thowing a UserError in a method not annotated with @throwsUserErrors should print an error.

## `Pre-resolve`, `post-resolve`

Functions called before a resolver & after a resolver

postResolve & preResolve should pass resolver metadata

- And add a way to set and get metadata on a resolver
- Add a way to make a method run on a resolver or a controller (like wrapWithInjectors)
