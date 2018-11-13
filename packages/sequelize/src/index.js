
// @flow

import { URL } from 'url';
import Sequelize from 'sequelize';
import { asyncGlob } from '@stilt/util';
import { getDbMeta, Options } from './decorators';

export {
  BelongsTo,
  belongsTo,

  BelongsToMany,
  belongsToMany,

  HasMany,
  hasMany,

  Attribute,
  attribute,

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

  async preInitPlugin(app) {
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
        host: uri.hostname,
        port: uri.port,
        dialect: uri.protocol.slice(0, -1),
        logging: this.config.debug ? this.logger.info.bind(this.logger) : null,
      },
    );

    const modelDirectory = this.config.models || '**/*.entity.js';

    Options.currentSequelize = this.sequelize;
    await loadModels(modelDirectory);
    Options.currentSequelize = null;

    await this.sequelize.authenticate();
    await this.sequelize.sync();

    this.logger.info('Database Connection Ready');

    sequelizeDeferred.resolve(this.sequelize);
  }
}

async function loadModels(modelsGlob) {

  const modelFiles = await asyncGlob(modelsGlob);

  for (const fileName of modelFiles) {
    const module = require(fileName);
    const model = module.default || module;

    if (typeof model !== 'function') {
      throw new Error(`Could not load Sequelize Model in file ${fileName}. Make sure a Class is exported`);
    }

    if (model.disabled) {
      continue;
    }

    const meta = getDbMeta(model);
    if (meta && meta.associations) {
      for (const associations of meta.associations) {
        model[associations.type](...associations.parameters);
      }
    }
  }
}

function Deferred() {

  let resolve;
  const promise = new Promise(_resolve => {
    resolve = _resolve;
  });

  return { promise, resolve };
}
