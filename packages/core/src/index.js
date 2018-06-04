// @flow

export default class App {

  _plugins = new Map();

  constructor() {
    setImmediate(() => this.initPlugins());

    this.logger = this.makeLogger('core');
  }

  async initPlugins() {
    // TODO init phases VS "load before / after"?

    await this._runPhase('preInit');
    await this._runPhase('init');
    await this._runPhase('postInit');
  }

  _runPhase(phase) {
    return [...this._plugins.values()].map(plugin => {
      const methodName = `${phase}Plugin`;
      if (plugin[methodName]) {
        this.logger.debug(`Running ${phase} on ${getName(plugin)}`);
        return plugin[methodName](this);
      }

      return null;
    });
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
    if (!this._plugins.has(pluginIdentifier)) {
      throw new TypeError(`Plugin with identifier ${String(pluginIdentifier)} has not been registered. Did you forget to register it?`);
    }

    return this._plugins.get(pluginIdentifier);
  }

  makeLogger() {
    // TODO use actual logger & namespace it.
    return console;
  }
}

function getName(obj) {
  return obj && obj.constructor && obj.constructor.name || String(obj);
}
