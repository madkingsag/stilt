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
    throw new Error('[REST] Currently only Joi validation is supported in parameter decorators.');
  }

  const validation = paramValidator.validate(paramValue, validationOpts);

  if (validation.error) {
    const validationError = validation.error;

    throw new RestError(`Invalid ${paramType} parameter ${JSON.stringify(paramName)} in ${JSON.stringify(context.route.route)}: ${validationError.message} (got ${JSON.stringify(paramValue)})`)
      .withStatus(errorStatus)
      .withCode(`INVALID_${changeCase.constantCase(paramName)}`);
  }

  return validation.value;
}

function makeParameterInjector(factoryOptions) {

  const validationOptions = {
    convert: true,
    ...factoryOptions.joiOptions,
  };

  return makeControllerInjector({
    dependencies: { contextProvider: IContextProvider },
    run([validators, runtimeOptions], { contextProvider }: { contextProvider: ContextProvider }) {

      const context = contextProvider.getCurrentContext();
      const rawParametersBag = factoryOptions.getParametersBag(context);
      const outputKey = runtimeOptions && runtimeOptions.as;

      if (validators == null) {
        return null;
      }

      if (Array.isArray(validators)) {

        if (typeof rawParametersBag !== 'object' || rawParametersBag === null) {
          return null;
        }

        const parsedParameters = Object.create(null);
        for (const paramName of validators) {
          parsedParameters[paramName] = rawParametersBag[paramName];
        }

        return outputKey ? { [outputKey]: parsedParameters } : parsedParameters;
      }

      if (isPlainObject(validators)) {
        const parsedParameters = Object.create(null);

        for (const [paramName, paramValidator] of Object.entries(validators)) {

          const rawParameter = rawParametersBag[paramName];

          parsedParameters[paramName] = runValidation(
            paramName,
            rawParameter,
            paramValidator,
            factoryOptions.name,
            context,
            validationOptions,
            factoryOptions.errorStatus,
          );
        }

        return outputKey ? { [outputKey]: parsedParameters } : parsedParameters;
      }

      const parsedBag = runValidation(`<${factoryOptions.name}>`, rawParametersBag, validators, '', context, validationOptions, factoryOptions.errorStatus);
      if (outputKey || !isPlainObject(parsedBag)) {
        return { [outputKey || factoryOptions.name]: parsedBag };
      }

      return parsedBag;
    },
  });
}

export const PathParams = makeParameterInjector({
  name: 'path',
  getParametersBag(context) {
    return context.params;
  },

  joiOptions: {

    // path params are non-null by default
    presence: 'required',
  },

  // if a part of the path is invalid, it's a not-found error.
  errorStatus: 404,
});

export const QueryParams = makeParameterInjector({
  name: 'query',
  getParametersBag(context) {
    return context.query;
  },

  joiOptions: {

    // query params are optional by default
    presence: 'optional',
    allowUnknown: true,
    stripUnknown: true,
  },

  errorStatus: 400,
});

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
 *
 * @example
 * \@BodyParams(Joi.array())
 * => output { body: [] }
 *
 * @example
 * \@BodyParams(Joi.string(), { as: 'val' })
 * => output { val: '' }
 *
 * @example
 * \@BodyParams(Joi.string(), { as: 'val' })
 * => output { val: '' }
 */
export const BodyParams = makeParameterInjector({
  name: 'body',
  getParametersBag(context) {
    return context.request.body;
  },

  joiOptions: {

    // body params are required by default
    presence: 'required',
  },

  errorStatus: 400,
});

export const Headers = makeParameterInjector({
  name: 'header',
  getParametersBag(context) {
    return context.request.headers;
  },

  joiOptions: {

    // query params are optional by default
    presence: 'optional',
    allowUnknown: true,
    stripUnknown: true,
  },

  errorStatus: 400,
});
