// @flow

export default class App {

  _plugins = new Map();

  use(plugin) {
    const moduleIdentifier = plugin.MODULE_IDENTIFIER || plugin.constructor.MODULE_IDENTIFIER;
    if (typeof moduleIdentifier !== 'symbol') {
      throw new TypeError(`Trying to load stilt plugin named "${getName(plugin)}" but we cannot uniquely identify it. It is missing the property "MODULE_IDENTIFIER" (must be a Symbol).`);
    }

    if (typeof plugin.initPlugin !== 'function') {
      throw new TypeError(`Trying to load stilt plugin named "${getName(plugin)}" but it is missing a initPlugin method. (signature: (app: App) => void)`);
    }

    plugin.initPlugin(this);

    this._plugins.set(moduleIdentifier, plugin);
  }

  getPlugin(pluginIdentifier) {
    if (!this._plugins.has(pluginIdentifier)) {
      throw new TypeError(`Plugin with identifier ${String(pluginIdentifier)} has not been registered. Did you forget to register it?`);
    }

    return this._plugins.get(pluginIdentifier);
  }
}

function getName(obj) {
  return obj && obj.constructor && obj.constructor.name || String(obj);
}
