// @flow

import { GET } from '@stilt/rest';

export default class HelloController {

  @GET('/')
  static helloRoute() {
    return 'Hello World';
  }
}
