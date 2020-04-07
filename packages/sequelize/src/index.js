
// @flow

import { URL } from 'url';
import Sequelize from 'sequelize';
import { asyncGlob } from '@stilt/util';
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

type Config = {
  databaseUri: string,
  models: string,
  debug?: boolean,
  sequelizeOptions: Object, // TODO typing
};

export default class StiltSequelize {

  static MODULE_IDENTIFIER = Symbol('@stilt/sequelize');

  config: Config;

  constructor(config: Config) {
    this.config = {
      ...config,
      namespace: (config.namespace || 'stilt-sequelize'),
    };
  }

  async init(app) {
    const sequelizeDeferred = Deferred();

    app.registerInjectables({
      [`${this.config.namespace}:sequelize`]: sequelizeDeferred.promise,
    });

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

    sequelizeDeferred.resolve(this.sequelize);
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
