// @flow

import StiltHttp from '@stilt/http';
import { asyncGlob } from '@stilt/util';
import { wrapControllerWithInjectors } from '@stilt/http/dist/controllerInjectors';
import { getRoutingMetadata } from './HttpMethodsDecorators';
import { IsRestError } from './RestError';

export * from './HttpMethodsDecorators';
export { default as RestError, IsRestError } from './RestError';

export default class StiltRest {

  static MODULE_IDENTIFIER = Symbol('@stilt/rest');

  constructor(config = {}) {
    this._controllersGlob = config.controllers || '**/*.rest.js';
  }

  async initPlugin(app) {
    this._app = app;

    this.logger = app.makeLogger('rest');

    this.server = app.getPlugin(StiltHttp.MODULE_IDENTIFIER);
    await this._loadControllers();
  }

  async _loadControllers() {
    this.logger.debug(`loading all controllers matching ${this._controllersGlob}`);

    const controllers = await asyncGlob(this._controllersGlob);

    const apiClasses = [];
    for (const controllerPath of Object.values(controllers)) {
      const controllerModule = require(controllerPath);
      const controllerClass = controllerModule.default || controllerModule;

      if (controllerClass == null || (typeof controllerClass !== 'function' && typeof controllerClass !== 'object')) {
        continue;
      }

      apiClasses.push(controllerClass);
    }

    const apiInstances = await Promise.all(
      apiClasses.map(resolverClass => {
        if (typeof resolverClass === 'function') {
          return this._app.instanciate(resolverClass);
        }

        return null;
      })
    );

    const routeHandlers = [...apiClasses, ...apiInstances];

    for (const Class of routeHandlers) {
      const routingMetaList = getRoutingMetadata(Class);
      if (!routingMetaList) {
        continue;
      }

      for (const routingMeta of routingMetaList) {
        const methodName = routingMeta.handlerName;
        const classMethod = Class[methodName];
        const routeHandler = wrapControllerWithInjectors(
          Class,
          methodName,
          classMethod.bind(Class),
          this._app,
        );

        this.server.registerRoute(routingMeta.httpMethod, routingMeta.path, wrapError(routeHandler));
      }
    }
  }
}

function wrapError(callback: Function) {

  return function wrappedError(context) {
    try {
      const val = callback();

      if (val == null || !val.then) {
        return formatSuccess(val, context);
      }

      return val.then(
        asyncVal => formatSuccess(asyncVal, context),
        e => formatError(e, context)
      );
    } catch (e) {
      return formatError(e, context);
    }
  };
}

function formatSuccess(val, context) {

  if (val === void 0) {
    val = null;
  }

  if (val && typeof val.pipe === 'function') {
    return val;
  }

  return { data: val };
}

function formatError(err, context) {
  if (!err || !err[IsRestError] || !err.status || err.status === 500 || !err.toJSON) {
    throw err;
  }

  context.response.status = err.status;

  return {
    error: err.toJSON(),
  };
}
