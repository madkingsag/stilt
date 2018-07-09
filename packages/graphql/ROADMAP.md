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

- Expose GraphQLError & IsUserError
- Require that those classes have a .toJSON() method
- (ensure GraphQLError has a .toJSON)
- 2 modes: Errors as part of schema (root.data.query.error) or Errors as part of root.errors
    - mode root.errors: No special action
    - mode root.data.query.error: Add post resolver and require that resolvers which can throw user error are
      annotated with `@ThrowsUserErrors` (`@throwsUserErrors`)
    ```javascript
     function postResolve(error, node) {

       if (!error) {
         return {
           error: null,
           node,
         };
       }

       if (!error[IsUserError]) {
         throw error;
       }

       return {
         error: error.toJSON(),
         node,
       };
     },
    ```
    - Document how error handling works
    - Wrap postResolver to transform error.

## `Pre-resolve`, `post-resolve`

Functions called before a resolver & after a resolver

postResolve & preResolve should pass resolver metadata

- And add a way to set and get metadata on a resolver
- Add a way to make a method run on a resolver or a controller (like wrapWithInjectors)
