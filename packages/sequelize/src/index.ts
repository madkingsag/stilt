import { URL } from 'url';
import type { TRunnable, Logger, InjectableIdentifier, Factory } from '@stilt/core';
import { isRunnable, runnable, factory, App } from '@stilt/core';
import { asyncGlob } from '@stilt/util';
import type { Dialect, SyncOptions } from 'sequelize';
import { Sequelize } from 'sequelize';
import { getAssociationMeta, getModelInitData } from './decorators.js';

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
} from './decorators.js';

export type {
  HasOneAssociationOptions,
  BelongsToAssociationOptions,
  HasManyAssociationOptions,
  BelongsToManyAssociationOptions,
} from './decorators';

export { withTransaction, getCurrentTransaction } from './transactions.js';

type Config = {
  namespace?: string,
  databaseUri: string,
  models: string,
  debug?: boolean,
  sequelizeOptions: Object, // TODO typing
  sync?: boolean | SyncOptions,
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

  static configure(config: Config | TRunnable<Config>, identifierConfig?: IdentifierConfig): Factory<StiltSequelize> {
    const getConfig = isRunnable(config) ? config : runnable(() => config);

    const identifiers: InjectableIdentifier[] = [
      identifierConfig?.identifiers?.['stilt-sequelize'] ?? 'stilt-sequelize',
    ];

    // this module also declares a secondary 'sequelize' module. This module should be init if that secondary module is required
    const registering: InjectableIdentifier[] = [
      identifierConfig?.identifiers?.sequelize ?? 'sequelize',
    ];

    if (identifierConfig?.defaultModule ?? true) {
      identifiers.push(StiltSequelize);
      registering.push(Sequelize);
    }

    return factory({
      ids: identifiers,
      // Extra modules being registered by this factory. They must be declared before the end of the constructor.
      // The value can be a promise if the initialisation is async
      registering,
      build: runnable((app, resolvedConfig) => {
        return new StiltSequelize(app, resolvedConfig, identifierConfig, theSecret);
      }, [App, getConfig]),
    });
  }

  public readonly sequelize: Sequelize;
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly modelLoadingPromise: Promise<any>;

  private running: boolean = false;

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  private readonly syncCompleteDeferred = deferred<void>();

  get syncCompletePromise(): Promise<void> {
    return this.syncCompleteDeferred.promise;
  }

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

    app.lifecycle.on('start', async () => this.start());
    app.lifecycle.on('close', async () => this.close());

    this.logger = app.makeLogger('sequelize');
    const uri = new URL(this.config.databaseUri);

    const dialect = uri.protocol.slice(0, -1);
    assertDialect(dialect);

    this.sequelize = new Sequelize(
      uri.pathname.substr(1),
      uri.username,
      uri.password,
      {
        ...(this.config.sequelizeOptions || {}),
        host: uri.hostname,
        port: Number(uri.port),
        dialect,
        logging: this.config.debug ? this.logger.info.bind(this.logger) : null,
      },
    );

    const sequelizeModuleId = identifierConfig?.identifiers?.sequelize ?? 'sequelize';
    app.registerInstance(sequelizeModuleId, this.sequelize);

    if (identifierConfig?.defaultModule ?? true) {
      app.registerInstance(Sequelize, this.sequelize);
    }

    const modelDirectory = this.config.models || '**/*.entity.{js,ts}';
    this.modelLoadingPromise = loadModels(modelDirectory, this.sequelize);
  }

  async start() {
    if (this.running) {
      return;
    }

    this.running = true;

    await this.modelLoadingPromise;
    await this.sequelize.authenticate();

    const sync = this.config.sync ?? true;

    if (sync !== false) {
      const syncOptions = typeof sync === 'boolean' ? undefined : sync;
      await this.sequelize.sync(syncOptions);
    }

    this.syncCompleteDeferred.resolve();

    this.logger.debug('Database Connection Ready');
  }

  async close() {
    await this.sequelize.close();
    this.running = false;
  }

  isRunning() {
    return this.running;
  }
}

async function loadModels(modelsGlob, sequelize) {

  const modelFiles = await asyncGlob(modelsGlob);

  const models = await Promise.all(modelFiles.map(async file => {
    const modelModule = await import(file);
    const model = modelModule.default;

    if (typeof model !== 'function') {
      throw new Error(`Could not load Sequelize Model in file ${file}. Make sure a Class is exported`);
    }

    return model;
  }));

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

const validDialects = ['mysql', 'postgres', 'sqlite', 'mariadb', 'mssql', 'mariadb'];
export function isDialect(dialect: string): dialect is Dialect {
  return validDialects.includes(dialect);
}

export function assertDialect(dialect: string): asserts dialect is Dialect {
  if (!isDialect(dialect)) {
    throw new Error(`${dialect} is not a valid dialect. Use one of the following values instead: ${validDialects.join(', ')}`);
  }
}

function deferred<T>(): { promise: Promise<T>, resolve(val: T): void } {
  let resolve;

  const promise = new Promise<T>(_resolve => {
    resolve = _resolve;
  });

  return { promise, resolve };
}
