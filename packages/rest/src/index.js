// @flow

import StiltHttp from '@stilt/http';
import requireAll from 'require-all';
import { getRoutingMetadata } from './HttpMethodsDecorators';

export * from './HttpMethodsDecorators';

export default class StiltRest {

  static MODULE_IDENTIFIER = Symbol('@stilt/rest');

  constructor(config) {
    this._config = config;
  }

  initPlugin(app) {
    // this.logger = app.makeLogger('rest');

    this.server = app.getPlugin(StiltHttp.MODULE_IDENTIFIER);
    this.loadControllers(this._config.controllers);
  }

  loadControllers(controllerDir) {
    // this.logger.debug(`loading all controllers from ${controllerDir}`);

    const controllers = requireAll({
      dirname: controllerDir,
      filter: /\.jsm?$/,
      recursive: true,
    });

    for (const controllerModule of Object.values(controllers)) {
      const controller = controllerModule.default;

      const methodNames = Reflect.ownKeys(controller);

      for (const methodName of methodNames) {
        const methodHandler = controller[methodName];

        const routingMeta = getRoutingMetadata(methodHandler);
        if (!routingMeta) {
          continue;
        }

        const routeHandler = methodHandler.bind(controller);
        for (const routeMeta of routingMeta) {
          this.server.registerRoute(routeMeta.method, routeMeta.path, routeHandler);
        }
      }
    }
  }
}
