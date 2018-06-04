// @flow

import { resolve } from '@stilt/graphql';
import User from '../models/UserModel';

export default class UserController {

  @resolve('Mutation.createUser')
  static createUser({ name }) {

    return User.create({ name });
  }
}
