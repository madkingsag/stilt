# ROADMAP

## Resolvers

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
