// @flow

import { asyncGlob } from '@stilt/util';
import DependencyInjector from './dependency-injector';

export { AsyncModuleInit, Inject, Inject as inject, AsyncModuleInit as asyncModuleInit } from './dependency-injector';

export default class App {

  _dependencyInjector = new DependencyInjector();

  _plugins = new Map();
  _injectablesGlob;

  constructor(config = {}) {
    asyncGlob.cwd = config.cwd;

    this.logger = this.makeLogger('core');
    this._injectablesGlob = config.injectables || '**/*.injectable.js';
  }

  async initPlugins() {
    // TODO init phases VS "load before / after"?

    await this._runPhase('preInit');
    await this._runPhase('init');
    await this._runPhase('postInit');
  }

  _runPhase(phase) {
    const promises = [...this._plugins.values()].map(plugin => {
      const methodName = `${phase}Plugin`;
      if (plugin[methodName]) {
        this.logger.debug(`Running ${phase} on ${getName(plugin)}`);
        return plugin[methodName](this);
      }

      return null;
    });

    return Promise.all(promises);
  }

  use(plugin) {
    const moduleIdentifier = plugin.MODULE_IDENTIFIER || plugin.constructor.MODULE_IDENTIFIER;
    if (typeof moduleIdentifier !== 'symbol') {
      throw new TypeError(`Trying to load stilt plugin named "${getName(plugin)}" but we cannot uniquely identify it. It is missing the property "MODULE_IDENTIFIER" (must be a Symbol).`);
    }

    if (typeof plugin.preInitPlugin !== 'function' && typeof plugin.initPlugin !== 'function' && typeof plugin.postInitPlugin !== 'function') {
      throw new TypeError(`Trying to load stilt plugin named "${getName(plugin)}" but it is missing an initialization method (preInitPlugin, initPlugin or postInitPlugin). (signature: (app: App) => void)`);
    }

    this._plugins.set(moduleIdentifier, plugin);
  }

  getPlugin(pluginIdentifier) {
    if (pluginIdentifier.MODULE_IDENTIFIER) {
      return this.getPlugin(pluginIdentifier.MODULE_IDENTIFIER);
    }

    if (!this._plugins.has(pluginIdentifier)) {
      throw new TypeError(`Plugin with identifier ${String(pluginIdentifier)} has not been registered. Did you forget to register it?`);
    }

    return this._plugins.get(pluginIdentifier);
  }

  makeLogger() {
    // TODO use actual logger & namespace it.
    return console;
  }

  /**
   * Starts the application.
   */
  async init() {
    await this._findInjectables();

    await this.initPlugins();
  }

  async _findInjectables() {
    const injectableFiles = await asyncGlob(this._injectablesGlob);

    const declarations = injectableFiles.map(file => {
      const module = require(file);
      if (module.default) {
        return module.default();
      }

      return module();
    });

    for (const declaration of declarations) {
      this._dependencyInjector.registerAll(declaration);
    }
  }

  instanciate(Class) {
    return this._dependencyInjector.getInstance(Class);
  }

  registerInjectables(map) {
    return this._dependencyInjector.registerAll(map);
  }
}

function getName(obj) {
  return obj && obj.constructor && obj.constructor.name || String(obj);
}
