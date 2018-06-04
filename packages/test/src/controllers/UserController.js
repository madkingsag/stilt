// @flow

import { resolve } from '@stilt/graphql';
import User from '../models/UserModel';

export default class UserController {

  @resolve('Mutation.createUser')
  static createUser({ email }) {

    return User.create({ email });
  }
}
