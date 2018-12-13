// @flow

import util from 'util';
import { asyncGlob, awaitAllEntries, isPlainObject, mapObject } from '@stilt/util';
import DependencyInjector from './dependency-injector';

export { AsyncModuleInit, Inject, Inject as inject, AsyncModuleInit as asyncModuleInit } from './dependency-injector';

export interface Plugin {

  +init?: (app: App) => void | Promise<void>;
  +start?: () => void | Promise<void>;
  +close?: () => void | Promise<void>;
}

type Config = {
  cwd: ?string,
  logLevel: ?string,
  injectables: ?string,
};

export default class App {

  _dependencyInjector = new DependencyInjector();

  _plugins: Map<Symbol, Plugin> = new Map();
  _injectablesGlob;
  _pluginInitPromises = [];

  constructor(config: Config = {}) {

    asyncGlob.cwd = config.cwd;

    this._defaultLogLevel = config.logLevel || 'info';

    this.logger = this.makeLogger('core', { logLevel: this._defaultLogLevel });
    this._injectablesGlob = config.injectables || '**/*.injectable.js';

    // make StiltApp injectable
    this._dependencyInjector.registerInstance(App, this);
  }

  _runPluginMethod(methodName) {
    const promises = [...this._plugins.values()].map(plugin => {
      if (plugin[methodName]) {
        this.logger.debug(`Running ${methodName} on ${getName(plugin)}`);
        return plugin[methodName](this);
      }

      return null;
    });

    return Promise.all(promises);
  }

  use(plugin: Plugin) {
    const moduleIdentifier = plugin.MODULE_IDENTIFIER || plugin.constructor.MODULE_IDENTIFIER;
    if (typeof moduleIdentifier !== 'symbol') {
      throw new TypeError(`Trying to load stilt plugin named "${getName(plugin)}" but we cannot uniquely identify it. It is missing the property "MODULE_IDENTIFIER" (must be a Symbol).`);
    }

    this._plugins.set(moduleIdentifier, plugin);

    this._pluginInitPromises.push(plugin.init(this));

    // make this plugin injectable
    this._dependencyInjector.registerAll({ [moduleIdentifier]: plugin });
    this._dependencyInjector.registerInstance(plugin.constructor, plugin);
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

  makeLogger(namespace: string) {
    // TODO use actual logger & namespace it.
    return console;
  }

  /**
   * Starts the application.
   */
  async start() {
    await Promise.all(this._pluginInitPromises);
    await this._findInjectables();
    await this._runPluginMethod('start');
  }

  /**
   * Closes the application
   */
  async close() {
    await this._runPluginMethod('close');
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
    return this.instantiate(Class);
  }

  instantiate: <T>(classList: Array<Class<T>>) => T[];
  instantiate: <T>(classList: { [string]: Class<T> }) => { [string]: T };

  instantiate<T>(Class: Class<T>): T {
    if (typeof Class === 'object' && Class !== null) {

      if (Array.isArray(Class)) {
        return Promise.all(Class.map(ClassItem => this._dependencyInjector.getInstance(ClassItem)));
      }

      if (isPlainObject(Class)) {
        return awaitAllEntries(mapObject(Class, ClassItem => this._dependencyInjector.getInstance(ClassItem)));
      }
    }

    return this._dependencyInjector.getInstance(Class);
  }

  registerInjectables(map) {
    return this._dependencyInjector.registerAll(map);
  }

  static async createApp(InitModule: Function, config: ?Config) {
    const app = new App(config);
    await app._findInjectables();

    return app.instantiate(InitModule);
  }
}

function getName(obj) {
  return obj && obj.constructor && obj.constructor.name || String(obj);
}

App.prototype.instanciate = util.deprecate(App.prototype.instanciate, 'StiltCore#instanciate is deprecated and renamed into StiltCore#instantiate');
