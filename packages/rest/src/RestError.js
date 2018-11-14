// @flow

export const IsRestError = Symbol('is-rest-error');

export default class RestError extends Error {

  [IsRestError] = true;

  code: string | number;
  status: number = 400;

  withCode(code: string | number): RestError {
    this.code = code;

    return this;
  }

  withStatus(status: number) {
    this.status = status;

    return this;
  }

  toJSON() {
    return {
      message: this.message,
      code: this.code,
    };
  }
}
