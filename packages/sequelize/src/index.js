
// @flow

import { URL } from 'url';
import Sequelize from 'sequelize';
import requireAll from 'require-all';
import { getDbMeta, Options } from './decorators';

export { BelongsTo, BelongsToMany, HasMany, Attribute, Attributes, Options } from './decorators';

type Config = {
  databaseUri: string,
  models: string,
  debug?: boolean,
};

export default class StiltSequelize {

  static MODULE_IDENTIFIER = Symbol('@stilt/sequelize');

  config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async preInitPlugin(app) {
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

    const modelDirectory = this.config.models;

    Options.currentSequelize = this.sequelize;
    loadModels(modelDirectory);
    Options.currentSequelize = null;

    await this.sequelize.authenticate();
    await this.sequelize.sync();

    this.logger.info('Database Connection Ready');
  }
}

function loadModels(modelsDir) {

  const models = requireAll({
    dirname: modelsDir,
    filter: /(.+\.jsm?$)/,
    recursive: true,
  });

  for (const [fileName, module] of Object.entries(models)) {
    const model = module.default || module;

    if (typeof model !== 'function') {
      throw new Error(`Could not load Sequelize Model in file ${modelsDir}/${fileName}. Make sure a Class is exported`);
    }

    if (model.disabled) {
      continue;
    }

    const meta = getDbMeta(model);
    if (meta && meta.relationships) {
      for (const relationship of meta.relationships) {
        // eslint-disable-next-line prefer-spread
        model[relationship.name].apply(model, relationship.args);
      }
    }
  }
}
