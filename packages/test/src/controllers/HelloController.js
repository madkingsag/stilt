// @flow

import { GET } from '@stilt/rest';
import { resolve } from '@stilt/graphql';

export default class HelloController {

  @GET('/')
  @resolve('Query.hello')
  static helloRoute() {
    return 'Hello World';
  }
}
