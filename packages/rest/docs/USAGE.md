# @stilt/rest

*Rest Layer for Stilt Framework*

## Usage

In order to use `@stilt/rest`, you will first need to install it and its dependencies:

`npm i @stilt/core @stilt/http @stilt/rest`

```javascript
import Stilt from '@stilt/core';
import StiltHttp from '@stilt/http';
import StiltRest from '@stilt/rest';

const app = new Stilt();

// Install HTTP server.
app.use(new StiltHttp({
  port: process.env.PORT || 8080,
}));

// Add GraphQL layer
app.use(new StiltRest({
  // load any .rest.js as rest endpoint controllers.
  controllers: '**/*.rest.js',
}));

app.init();
```

## Options

The `StiltRest` constructor accepts an option object with the following keys:

### `schema`

- `controllers` *(optional, default: `'**/*.rest.js'`)*: A [glob](https://en.wikipedia.org/wiki/Glob_(programming)) pattern defining where REST Controllers are located. Those controllers are tasked with defining the different REST endpoints.
The controllers should contain a default export that is a class defining various REST endpoints:

```javascript
// user/user.rest.js

// @flow

import { Inject } from '@stilt/core';
import { GET, PathParams, RestError } from '@stilt/rest';
import UserService from './user.service';

export default class UserRestApi {

  userService: UserService;

  constructor(dependencies: { userService: UserService }) {
    this.userService = dependencies.userService;
  }

  @GET('/users/:userId')
  @PathParams(0, {
    userId: Joi.string(),
  })
  async getUserById(params: { userId: string }) {

    const user = await this.userService.getUserFuzzy(params.userId);

    if (!user) {
      throw new RestError(`No user matches ${JSON.stringify(params.userId)}.`)
        .withCode('USER_NOT_FOUND')
        .withStatus(404);
    }

    return user.toJSON();
  }
}
```
