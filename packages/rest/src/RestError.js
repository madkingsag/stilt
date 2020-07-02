// @flow

export const IsRestError = Symbol('is-rest-error');

export default class RestError extends Error {

  [IsRestError] = true;

  code: string | number;
  status: number = 400;
  path: undefined | string[];

  withCode(code: string | number): RestError {
    this.code = code;

    return this;
  }

  withStatus(status: number) {
    this.status = status;

    return this;
  }

  withPath(path: string[]) {
    this.path = path;

    return this;
  }

  toJSON() {
    return {
      message: this.message,
      code: this.code,
      path: this.path,
    };
  }
}
