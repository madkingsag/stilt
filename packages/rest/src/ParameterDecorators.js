// @flow

import { makeControllerInjector, IContextProvider, type ContextProvider } from '@stilt/http';
import changeCase from 'change-case';
import RestError from './RestError';

function makeParameterInjector(injectorOptions) {

  return makeControllerInjector({
    dependencies: [IContextProvider],
    run([pathParams], [contextProvider]: [ContextProvider]) {

      // TODO replace with context-provider dependency.
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
          );
        }
      }

      return parsedParameters;
    },
  });
}

function runValidation(paramName, paramValue, paramValidator, paramType, context) {
  // TODO: currently Joi is hardcoded but I want it to be configurable in the future.

  if (paramValidator == null) {
    return paramValue;
  }

  if (!paramValidator.isJoi) {
    throw new Error('[REST] Currently only Joi validation is supported in parameter decorators. Either provide a Joi schema, use an array instead of an object for the list of parameters, or set the value to null.');
  }

  const Joi = require('joi');
  const validation = Joi.validate(paramValue, paramValidator);

  if (validation.error) {
    const validationError = validation.error;

    throw new RestError(`Invalid ${paramType} parameter ${JSON.stringify(paramName)} in ${JSON.stringify(context.route.route)}: ${validationError.message} (got ${JSON.stringify(paramValue)})`)
      .withStatus(400)
      .withCode(`INVALID_${changeCase.constantCase(paramName)}`);
  }

  return validation.value;
}

export const PathParams = makeParameterInjector({
  name: 'path',
  contextKey: 'params',
});

export const QueryParams = makeParameterInjector({
  name: 'query',
  contextKey: 'query',
});
