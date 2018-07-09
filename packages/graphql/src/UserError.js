// @flow

import { addPostResolver } from './ResolveDecorator';

export const IsUserError = Symbol('is-user-error');

export class UserError extends Error {

  _code: string;

  constructor(msg: string) {
    super(msg);

    this[IsUserError] = true;
  }

  withCode(code: string): UserError {
    this._code = code;
    return this;
  }

  get code(): string {
    return this._code;
  }

  toJSON() {

    return {
      code: this.code,
      message: this.message,
    };
  }
}

type Descriptor = {
  configurable: boolean,
  enumerable: boolean,
  writable: boolean,
  value: any,
  get: Function,
  set: Function,
};

function handleUserErrors(error, value) {

  if (!error) {
    return { error: null, value };
  }

  if (error[IsUserError]) {
    return {
      error: error.toJSON(),
      value: null,
    };
  }

  // unexpected error, graphql-errors will handle this one.
  throw error;
}

export function throwsUserErrors(Class: Function, methodName: string, descriptor: Descriptor): Descriptor {

  addPostResolver(Class, methodName, handleUserErrors);

  return descriptor;
}
