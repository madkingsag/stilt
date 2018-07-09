# @stilt/graphql

*GraphQL Adapter for Stilt Framework*

## Error-handling

There are three types of errors in GraphQL:
- *User errors*: Errors coming from the final user (eg. Trying to access a private resource such as the email of another user).
- *Client Developer errors*: Errors due to misusing the API (eg. Sending an invalid type as a parameter).
- *Unexpected errors*: Errors in the implementation of resolvers that cause them to throw.

Each of them should be handled differently:

### Unexpected errors

As those errors are unexpected, the developer of the schema do not need to handle those themselves. This framework will catch them, log them, and send an `Internal Error` error to the client.

### Client Developer Errors

Those errors are usually caused by misusing the API. As such, the GraphQL schema should be extremely clear on what input it expected.

The best way to respond to unexpected inputs is to define stricter types and use them as inputs.

### User Errors

Those are expected errors that should be displayed to the end user one way or another. They are errors such as "Your password is incorrect" or "This resource does not exist", etc...

Those errors should be part of the schema so the Client Developer knows to expect them and that they need to handle them.

Schema for queries which can return an error should look like this:

```graphql
type Mutation {
  registerUser(email: String!, password: String!): RegistrationResponse!
}

type RegistrationResponse {
  # The user in case of success, null otherwise
  node: User

  # The error in case of failure, null otherwise
  error: RegistrationError
}

type User {
  id: String!
  email: String!
}

type RegistrationError {
  # machine-readable unique error code
  code: RegistrationErrorCode!

  # human-readable explanation
  message: String!
}

enum RegistrationErrorCode {
  # Email with which the user wishes to register is already in use.
  EMAIL_IN_USE
}
```

This way is verbose, but the advantages are clear: The front-end developer knows in advance exactly which error codes they'll receive, and GraphQL will ensure that only those codes are sent.

[Ask for generics](https://github.com/facebook/graphql/issues/190) if you wish for a less verbose alternative, or export your schema as a JavaScript object and generate your types dynamically.

---

On the resolver side, we also need to annotate with `@throwsUserErrors` the resolvers that can throw user errors.

```javascript
// resolvers/ClientResolver.js

import { resolve, throwsUserError, UserError } from '@stilt/graphql';

export default class ClientResolver {

  @throwsUserError
  @resolve('Mutation.registerUser')
  async registerUser({ email, password }) {

    if (await User.findOne({ email })) {
      throw new UserError(`Email ${email} is already in use`).withCode('EMAIL_IN_USE');
    }

    return User.create({ email, password });
  }
}
```

`@throwsUserError` will make the resolver always return a response in the format `{ node, error }` (see "RegistrationResponse") instead of just `node`. That is a standard in this framework, your `TypeResponse` GraphQL type should be formed accordingly. *(want to change this? Send us a PR!)*

By default, `UserError` will be formatted into `{ code, message }` (see "RegistrationError"). We highly recommend you always provide a unique, stable, error code for automatic processing using `.withCode`.

#### Custom `UserError` class

if you want user errors to be formatted differently than `{ code, message }` (eg. to include additional metadata), you can define your own `UserError` class.

Such class can be any object as long as it has the `[IsUserError]` Symbol property set to `true` and a `toJSON` method. We however recommend making a subclass or `Error`.

```javascript
// MyUserError.js

import { IsUserError } from '@stilt/graphql';

export default class MyUserError extends Error {

  constructor(title) {
    super(title);

    // mark this instance as being a user error.
    // if this is not set, the error will be considered to be an unexpected error and an "internal error"
    // response will be sent to the client.
    this[IsUserError] = true;
  }

  withDescription(desc) {
    this.description = desc;
    return this;
  }

  withErrno(errno) {
    this.errno = errno;
    return this;
  }

  toJSON() {

    return {
      title: this.message,
      description: this.description,
      errno: this.errno,
    };
  }
}
```

You will need to adapt your Error types in your graphql schema to match the return value of `toJSON`. Using the above Error class, the schema should have a Error type defined like this: `MyUserError { title, description, errno }`.
