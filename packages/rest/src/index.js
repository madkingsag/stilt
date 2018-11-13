// @flow

import StiltHttp from '@stilt/http';
import { asyncGlob } from '@stilt/util';
import { wrapControllerWithInjectors } from '@stilt/http/dist/controllerInjectors';
import { getRoutingMetadata } from './HttpMethodsDecorators';

export * from './HttpMethodsDecorators';

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
        const classMethod = Class[routingMeta.handlerName];
        const routeHandler = wrapControllerWithInjectors(
          Class,
          classMethod,
          classMethod.bind(Class),
          this._app,
        );

        this.server.registerRoute(routingMeta.httpMethod, routingMeta.path, routeHandler);
      }
    }
  }
}
