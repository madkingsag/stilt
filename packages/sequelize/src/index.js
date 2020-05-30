
// @flow

import { URL } from 'url';
import Sequelize from 'sequelize';
import { asyncGlob } from '@stilt/util';
import { isRunnable, runnable, factory, App } from '@stilt/core';
import { getAssociationMeta, getModelInitData } from './decorators';

export {
  BelongsTo,
  belongsTo,

  BelongsToMany,
  belongsToMany,

  HasMany,
  hasMany,

  // Attribute,
  // attribute,

  Attributes,
  attributes,

  Options,
  options,

  HasOne,
  hasOne,
} from './decorators';

export { withTransaction, getCurrentTransaction } from './transactions';

type Config = {
  databaseUri: string,
  models: string,
  debug?: boolean,
  sequelizeOptions: Object, // TODO typing
};

type IdentifierConfig = {
  /**
   * If specified, defines the keys to use to inject this module dependency.
   * You will need to specify this if you need to use more than one instance of this module.
   */
  identifiers?: {
    'stilt-sequelize'?: string,
    'sequelize'?: string,
  },

  /**
   * If true, the StiltSequelize class will be usable as identifier to inject this module as a dependency,
   * and the Sequelize class will be usable as identifier to inject the sequelize instance.
   */
  defaultModule?: boolean,
};

const theSecret = Symbol('secret');

/**
 * @example
 * // static config
 * App.use(StiltSequelize.configure({
 *  databaseUri: 'postgres://user:password@localhost:1234/db',
 * }));
 *
 * @example
 * // dynamic config
 * App.use(StiltSequelize.configure(runnable({
 *   run(configModule) {
 *     return {
 *       databaseUri: configModule.database.uri,
 *     };
 *   },
 *   dependencies: [ConfigModule],
 * })));
 */
export class StiltSequelize {

  static configure(getConfig: Config | Runnable<Config>, identifierConfig?: IdentifierConfig) {
    if (!isRunnable(getConfig)) {
      getConfig = runnable(() => getConfig);
    }

    const identifiers = [
      identifierConfig?.identifiers?.['stilt-sequelize'] ?? 'stilt-sequelize',
    ];

    // this module also declares a secondary 'sequelize' module. This module should be init if that secondary module is required
    const registering = [
      identifierConfig?.identifiers?.['sequelize'] ?? 'sequelize',
    ];

    if (identifierConfig.defaultModule ?? true) {
      identifiers.push(StiltSequelize);
      registering.push(Sequelize);
    }

    return factory({
      ids: identifiers,
      // Extra modules being registered by this factory. They must be declared before the end of the constructor.
      // The value can be a promise if the initialisation is async
      registering,
      build: runnable((app, config) => {
        return new StiltSequelize(app, config, identifierConfig, theSecret);
      }, [App, getConfig]),
    });
  }

  config: Config;

  constructor(app: App, config: Config, identifierConfig: IdentifierConfig, secret: Symbol) {
    if (secret !== theSecret) {
      throw new Error('You\'re trying to instantiate StiltSequelize incorrectly.\n'
        + '=> If you\'re trying to instantiate it by doing new StiltSequelize(), call StiltSequelize.configure & pass the returned module to App.use instead.\n'
        + '=> If you\'re injecting this module through @Inject or similar, make sure this module was registered through App.use(StiltSequelize.configure(config))');
    }

    this.config = {
      ...config,
      namespace: (config.namespace || 'stilt-sequelize'),
    };

    const sequelizeDeferred = Deferred();

    const sequelizeModuleId = identifierConfig?.identifiers?.sequelize ?? 'sequelize';
    app.registerInstances({
      [sequelizeModuleId]: sequelizeDeferred.promise,
    });

    if (identifierConfig.defaultModule ?? true) {
      app.registerInstance(Sequelize, sequelizeDeferred.promise);
    }

    this.sequelizeDeferred = sequelizeDeferred;

    app.lifecycle.on('start', () => this.start());
    app.lifecycle.on('close', () => this.close());
  }

  async init(app) {

    this.logger = app.makeLogger('sequelize');
    const uri = new URL(this.config.databaseUri);

    this.sequelize = new Sequelize(
      uri.pathname.substr(1),
      uri.username,
      uri.password,
      {
        ...(this.config.sequelizeOptions || {}),
        host: uri.hostname,
        port: uri.port,
        dialect: uri.protocol.slice(0, -1),
        logging: this.config.debug ? this.logger.info.bind(this.logger) : null,
      },
    );

    const modelDirectory = this.config.models || '**/*.entity.js';

    await loadModels(modelDirectory, this.sequelize);
    await this.start();

    this.logger.info('Database Connection Ready');

    this.sequelizeDeferred.resolve(this.sequelize);
  }

  async start() {
    if (this.running) {
      return;
    }

    this.running = true;

    await this.sequelize.authenticate();
    await this.sequelize.sync();
  }

  async close() {
    await this.sequelize.close();
    this.running = false;
  }
}

async function loadModels(modelsGlob, sequelize) {

  const modelFiles = await asyncGlob(modelsGlob);

  const models = modelFiles.map(file => {
    const module = require(file);
    const model = module.default || module;

    if (typeof model !== 'function') {
      throw new Error(`Could not load Sequelize Model in file ${file}. Make sure a Class is exported`);
    }

    return model;
  });

  // init models
  for (const model of models) {
    const initData = getModelInitData(model);

    model.init(
      initData.attributes,
      {
        sequelize,
        ...initData.options,
      },
    );
  }

  const associations = getAssociationMeta(models);

  for (const association of associations) {
    const model = association.model;

    model[association.type](...association.parameters);
  }
}

function Deferred() {

  let resolve;
  const promise = new Promise(_resolve => {
    resolve = _resolve;
  });

  return { promise, resolve };
}
