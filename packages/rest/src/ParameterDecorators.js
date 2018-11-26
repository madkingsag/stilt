// @flow

import { makeControllerInjector, IContextProvider, type ContextProvider } from '@stilt/http';
import { isPlainObject } from '@stilt/util';
import changeCase from 'change-case';
import RestError from './RestError';

function runValidation(paramName, paramValue, paramValidator, paramType, context, validationOpts, errorStatus) {
  // TODO: currently Joi is hardcoded but I want it to be configurable in the future.

  if (paramValidator == null) {
    return paramValue;
  }

  if (!paramValidator.isJoi) {
    throw new Error('[REST] Currently only Joi validation is supported in parameter decorators. Either provide a Joi schema, use an array instead of an object for the list of parameters, or set the value to null.');
  }

  const Joi = require('joi');
  const validation = Joi.validate(paramValue, paramValidator, validationOpts);

  if (validation.error) {
    const validationError = validation.error;

    throw new RestError(`Invalid ${paramType} parameter ${JSON.stringify(paramName)} in ${JSON.stringify(context.route.route)}: ${validationError.message} (got ${JSON.stringify(paramValue)})`)
      .withStatus(errorStatus)
      .withCode(`INVALID_${changeCase.constantCase(paramName)}`);
  }

  return validation.value;
}

/**
 * @example
 * \@BodyParams(Joi.object().keys({ val: Joi.string() }))
 * => output: { val: '' }
 *
 * @example
 * \@BodyParams({
 *   val: Joi.string(),
 * })
 * => output: { val: '' }
 *
 * @example
 * \@BodyParams(Joi.string())
 * => output { body: '' }
 */
export const BodyParams = makeControllerInjector({
  dependencies: { contextProvider: IContextProvider },
  run([bodyParams], { contextProvider }: { contextProvider: ContextProvider }) {

    if (bodyParams == null) {
      return null;
    }

    const context = contextProvider.getCurrentContext();
    const rawBody = context.request.body;

    if (Array.isArray(bodyParams)) {

      if (typeof rawBody !== 'object' || rawBody === null) {
        return null;
      }

      const parsedParameters = Object.create(null);
      for (const paramName of bodyParams) {
        parsedParameters[paramName] = rawBody[paramName];
      }

      return parsedParameters;
    }

    const validationOptions = {
      convert: true,
      presence: 'required',
    };

    if (isPlainObject(bodyParams)) {
      const parsedParameters = Object.create(null);

      const rawBodyObject = (typeof rawBody !== 'object' || rawBody === null) ? {} : rawBody;

      for (const [paramName, paramValidator] of Object.entries(bodyParams)) {
        const parsedValue = runValidation(paramName, rawBodyObject[paramName], paramValidator, 'body', context, validationOptions, 400);

        parsedParameters[paramName] = parsedValue;
      }

      return parsedParameters;
    }

    const parsedBody = runValidation('<body>', rawBody, bodyParams, '', context, validationOptions, 400);
    if (typeof parsedBody !== 'object' || parsedBody === null) {
      return { body: parsedBody };
    }

    return parsedBody;
  },
});

function makeParameterInjector(injectorOptions) {

  const validationOptions = { convert: injectorOptions.convert, presence: injectorOptions.presence };

  return makeControllerInjector({
    dependencies: { contextProvider: IContextProvider },
    run([pathParams], { contextProvider }: { contextProvider: ContextProvider }) {

      const context = contextProvider.getCurrentContext();

      const parsedParameters = Object.create(null);

      if (Array.isArray(pathParams)) {
        for (const paramName of pathParams) {
          parsedParameters[paramName] = context[injectorOptions.contextKey][paramName];
        }
      } else {
        for (const [paramName, paramValidator] of Object.entries(pathParams)) {

          const paramValue = context[injectorOptions.contextKey][paramName];

          parsedParameters[paramName] = runValidation(
            paramName,
            paramValue,
            paramValidator,
            injectorOptions.name,
            context,
            validationOptions,
            injectorOptions.errorStatus,
          );
        }
      }

      return parsedParameters;
    },
  });
}

export const PathParams = makeParameterInjector({
  name: 'path',
  contextKey: 'params',

  // path params types can be converted by validators
  convert: true,

  // path params are non-null by default
  presence: 'required',

  // if a part of the path is invalid, it's a not-found error.
  errorStatus: 404,
});

export const QueryParams = makeParameterInjector({
  name: 'query',
  contextKey: 'query',

  // query params type can be converted by validators
  convert: true,

  // query params are optional by default
  presence: 'optional',

  errorStatus: 400,
});
