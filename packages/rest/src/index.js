// @flow

import StiltHttp from '@stilt/http';
import { asyncGlob } from '@stilt/util';
import { wrapControllerWithInjectors } from '@stilt/http/dist/controllerInjectors';
import { getRoutingMetadata } from './HttpMethodsDecorators';
import { IsRestError } from './RestError';

export * from './HttpMethodsDecorators';
export { default as RestError, IsRestError } from './RestError';
export { PathParams, QueryParams, BodyParams, PathParams as pathParams, QueryParams as queryParams, BodyParams as bodyParams } from './ParameterDecorators';

export interface JsonSerializer<T> {
  serialize(input: T): any | Promise<any>;
}

export default class StiltRest {

  static MODULE_IDENTIFIER = Symbol('@stilt/rest');
  serializers: Map<Function, JsonSerializer<*>> = new Map();

  constructor(config = {}) {
    this._controllersGlob = config.controllers || '**/*.rest.js';
  }

  async init(app) {
    this._app = app;

    this.logger = app.makeLogger('rest');

    this.server = app.getPlugin(StiltHttp.MODULE_IDENTIFIER);
    await this._loadControllers();
  }

  async addEntitySerializer(Class: Function, serializer: JsonSerializer) {

    const serializerInstance = await this._app.instantiate(serializer);

    this.serializers.set(Class.prototype, serializerInstance);
  }

  async entityToJson(entity: any) {

    if (entity === null || typeof entity !== 'object') {
      return entity;
    }

    const serializer = this.getSerializer(entity);
    if (serializer) {
      entity = await serializer.serialize(entity);
    } else if (entity.toJSON) {
      entity = entity.toJSON();
    }

    if (entity === null || typeof entity !== 'object') {
      return entity;
    }

    if (Array.isArray(entity)) {
      return Promise.all(
        entity.map(val => this.entityToJson(val)),
      );
    }

    const serializedEntity = Object.create(null);
    const promises = [];

    for (const key of Object.keys(entity)) {
      const val = entity[key];

      promises.push(this.entityToJson(val).then(newVal => {
        serializedEntity[key] = newVal;
      }));
    }

    await Promise.all(promises);

    return serializedEntity;
  }

  getSerializer(entity: Object) {
    const proto = Object.getPrototypeOf(entity);
    const serializer = this.serializers.get(proto);

    if (serializer) {
      return serializer;
    }

    if (proto === null) {
      return null;
    }

    return this.getSerializer(proto);
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
          return this._app.instantiate(resolverClass);
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

        this.server.registerRoute(routingMeta.httpMethod, routingMeta.path, this._wrapError(routeHandler));
      }
    }
  }

  _wrapError(callback: Function) {

    const that = this;

    return function wrappedError(context) {
      try {
        const val = callback(context.params || {});

        if (val == null || !val.then) {
          return that._formatSuccess(val, context);
        }

        return val.then(
          asyncVal => that._formatSuccess(asyncVal, context),
          e => formatError(e, context)
        );
      } catch (e) {
        return formatError(e, context);
      }
    };
  }

  _formatSuccess(val, context) {

    if (val === void 0) {
      val = null;
    }

    if (val && typeof val.pipe === 'function') {
      return val;
    }

    return this.entityToJson(val)
      .then(newVal => {
        return { data: newVal };
      });
  }
}

function formatError(err, context) {
  if (!err || !err[IsRestError] || !err.toJSON) {
    throw err;
  }

  context.response.status = err.status || 500;

  return {
    error: err.toJSON(),
  };
}
