# @stilt/rest

*Rest Layer for Stilt Framework*

## Error-handling

There are two types of errors in Stilt REST:
- *Rest errors*: Errors in the usage of the API. Those errors are visible by the user.
- *Unexpected errors*: Internal errors caused by a bug in the application. Those are always hidden from the user and instead sent to the console.

### REST Errors

REST errors are used to send an error to the user of the API. When using them you should always provide:
- A description of the error. (`constructor`)
- A code that would allow the application to recognize the error type even if the description changes. (`err.withCode()`)
- An HTTP status code. (`err.withStatus()`)

```javascript
import { GET, RestError } from '@stilt/rest';
import UserEntity from './user.entity';

class UserRestApi {

  @GET('/users/:userId')
  async getUser({ userId }) {

    const user = await UserEntity.findOne({ where: { userId } });

    if (user == null) {
        throw new RestError(`No user matches ID ${JSON.stringify(userId)}`)
            .withCode('USER_NOT_FOUND')
            .withStatus(404);
    }

    return user;
  }
}
```

#### Custom `RestError` class

If for any reason you need to define your own `RestError` class (such as for customizing the output), you can simply tag the instances of your error with the `IsRestError` Symbol.
You will also need to provide a `.toJSON` method so only relevant fields are sent to the client, and a `.status` field (by default `500` is used).

```javascript
// MyRestError.js

import { IsRestError } from '@stilt/rest';

export default class MyRestError extends Error {

  get status() {
    return 400;
  }

  constructor(message) {
    super(message);

    // mark this instance as being a dev error.
    // if this is not set, the error will be considered to be an unexpected error and an "internal error"
    // response will be sent to the client.
    this[IsDevError] = true;
  }

  toJSON() {
    return { message: this.message };
  }
}
```
