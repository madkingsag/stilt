import { addPostResolver } from './ResolveDecorator.js';

export const IsUserError = Symbol('is-user-error');

export class UserError extends Error {

  private _code: string;

  constructor(msg: string) {
    super(msg);

    this[IsUserError] = true;
  }

  withCode(code: string): this {
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

function handleUserErrors(error, node) {

  if (!error) {
    return { error: null, node };
  }

  if (error[IsUserError]) {
    return {
      error: error.toJSON(),
      node: null,
    };
  }

  // unexpected error, graphql-errors will handle this one.
  throw error;
}

export function ThrowsUserErrors(Class: Function, methodName: string, descriptor: Descriptor): Descriptor {

  addPostResolver(Class, methodName, handleUserErrors);

  return descriptor;
}
