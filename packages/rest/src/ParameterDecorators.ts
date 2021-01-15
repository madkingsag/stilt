import { makeControllerInjector, IContextProvider, ContextProvider } from '@stilt/http';
import { TControllerInjector } from '@stilt/http/types/controllerInjectors';
import { isPlainObject } from '@stilt/util';
import type { Schema as JoiSchema } from 'joi';
import RestError from './RestError';

let Joi;

try {
  // TODO: either force dep or move to top-level await + import()
  Joi = require('joi');
} catch (ignore) { /* ignore */ }

function runValidation(paramValue, paramValidator, parameterSource, context, validationOpts, errorStatus) {
  if (paramValidator == null) {
    return paramValue;
  }

  if (!Joi || !Joi.isSchema) {
    throw new Error('[REST] You need to install joi >= 16 in order to use parameter validation');
  }

  if (!Joi.isSchema(paramValidator)) {
    throw new Error('[REST] Only joi >= 16 schemas are supported in parameter validation.');
  }

  const validation = paramValidator.validate(paramValue, validationOpts);

  if (validation.error) {
    const validationError = validation.error;

    throw new RestError(`[${context.route.route}] Invalid ${parameterSource} input: ${validationError.message} (got ${JSON.stringify(validationError.details[0].context.value)})`)
      .withStatus(errorStatus)
      .withCode(`BAD_INPUT`)
      .withPath([
        parameterSource, // part of the request in which the parameter is found (body, query, path, header)
        ...validationError.details[0].path,
      ]);
  }

  return validation.value;
}

type TValidators = JoiSchema | Array<string> | { [key: string]: JoiSchema };

type TRuntimeOpts = {
  as?: string,
};

type TParameterInjector = TControllerInjector<[validator: TValidators, options?: TRuntimeOpts]>;

function makeParameterInjector(factoryOptions): TParameterInjector {

  const validationOptions = {
    convert: true,
    ...factoryOptions.joiOptions,
  };

  return makeControllerInjector({
    dependencies: { contextProvider: IContextProvider },
    run(
      [validators, runtimeOptions]: [TValidators, TRuntimeOpts],
      { contextProvider }: { contextProvider: ContextProvider },
    ) {

      const context = contextProvider.getCurrentContext();
      const rawParametersBag = factoryOptions.getParametersBag(context);
      const outputKey = runtimeOptions && runtimeOptions.as;

      if (validators == null) {
        return null;
      }

      // array of string, equivalent to Joi.object() where all provided keys are "any"
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

      // a plain object - convert to Joi.object and use the plain object as config
      if (isPlainObject(validators)) {
        validators = Joi.object(validators);
      }

      const parsedBag = runValidation(
        rawParametersBag,
        validators,
        factoryOptions.name,
        context,
        validationOptions,
        factoryOptions.errorStatus,
      );

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
