import type { InjectableIdentifier, TRunnable } from '@stilt/core';
import { App, factory, isRunnable, runnable } from '@stilt/core';
import type { Class } from '@stilt/core/types/typing';
import { StiltHttp } from '@stilt/http';
import { wrapControllerWithInjectors } from '@stilt/http/dist/controllerInjectors.js';
import { asyncGlob, awaitMapAllEntries, FORCE_SEQUENTIAL_MODULE_IMPORT } from '@stilt/util';
import { getRoutingMetadata } from './HttpMethodsDecorators.js';
import { IsRestError } from './RestError.js';

export * from './HttpMethodsDecorators.js';
export { default as RestError, IsRestError } from './RestError.js';
export { PathParams, QueryParams, BodyParams, PathParams as pathParams, QueryParams as queryParams, BodyParams as bodyParams } from './ParameterDecorators.js';
export { Files } from './Multipart.js';
export type { UploadedFile } from './Multipart';

export interface JsonSerializer<T> {
  serialize(input: T): any | Promise<any>;
}

type IdentifierConfig = {
  /**
   * If specified, defines the key to use to inject this module dependency.
   * Defaults to 'stilt-graphql'
   */
  identifier?: string,

  /**
   * If true, the StiltGraphQl class will be usable as identifier to inject this module as a dependency,
   */
  defaultModule?: boolean,
};

type Config = {
  controllers?: string,
};

const theSecret = Symbol('secret');

export class StiltRest {

  static configure(config: Config | TRunnable<Config> = {}, identifierConfig?: IdentifierConfig) {
    const getConfig: TRunnable<Config> = isRunnable(config) ? config : runnable(() => config);

    const identifiers: InjectableIdentifier[] = [
      identifierConfig?.identifier ?? 'stilt-rest',
    ];

    if (identifierConfig?.defaultModule ?? true) {
      identifiers.push(StiltRest);
    }

    return factory({
      ids: identifiers,
      // Extra modules being registered by this factory. They must be declared before the end of the constructor.
      // The value can be a promise if the initialisation is async
      build: runnable(async (app: App, stiltHttp: StiltHttp, resolvedConfig: Config) => {
        const schemaGlob = resolvedConfig.controllers || '**/*.rest.{js,ts}';

        const controllers = await this.loadControllers(app, schemaGlob);

        return new StiltRest(app, stiltHttp, controllers, theSecret);
      }, [App, StiltHttp, getConfig]),
    });
  }

  private readonly serializers: Map<Function, JsonSerializer<any>> = new Map();
  private readonly app: App;
  public readonly stiltHttp: StiltHttp;

  constructor(app: App, stiltHttp: StiltHttp, controllers, secret: Symbol) {
    if (secret !== theSecret) {
      throw new Error('You\'re trying to instantiate StiltRest incorrectly.\n'
        + '=> If you\'re trying to instantiate it by doing new StiltRest(), call StiltRest.configure(config) & pass the returned module to App.use instead.\n'
        + '=> If you\'re injecting this module through @Inject or similar, make sure this module was registered through App.use(StiltRest.configure(config))');
    }

    this.stiltHttp = stiltHttp;
    this.app = app;

    for (const controller of controllers) {
      this.stiltHttp.registerRoute(controller.method, controller.path, this._wrapError(controller.handler));
    }
  }

  async addEntitySerializer(entityClass: Function, serializer: Class<JsonSerializer<any>>): Promise<void> {
    const serializerInstance: JsonSerializer<any> = await this.app.instantiate(serializer);

    this.serializers.set(entityClass.prototype, serializerInstance);
  }

  async entityToJson(entity: any) {

    if (entity === null || typeof entity !== 'object') {
      return entity;
    }

    const serializer = this.getSerializer(entity);
    if (serializer) {
      entity = await serializer.serialize(entity);
    } else if (entity.toJSON) {
      entity = entity.toJSON();
    }

    if (entity === null || typeof entity !== 'object') {
      return entity;
    }

    if (Array.isArray(entity)) {
      return Promise.all(
        entity.map(val => this.entityToJson(val)),
      );
    }

    const serializedEntity = Object.create(null);
    const promises = [];

    for (const key of Object.keys(entity)) {
      const val = entity[key];

      promises.push(this.entityToJson(val).then(newVal => {
        serializedEntity[key] = newVal;
      }));
    }

    await Promise.all(promises);

    return serializedEntity;
  }

  getSerializer(entity: Object) {
    const proto = Object.getPrototypeOf(entity);
    const serializer = this.serializers.get(proto);

    if (serializer) {
      return serializer;
    }

    if (proto === null) {
      return null;
    }

    return this.getSerializer(proto);
  }

  private static async loadControllers(app: App, schemaGlob: string) {
    const controllers = await asyncGlob(schemaGlob);

    const apiClasses = (await awaitMapAllEntries(Object.values(controllers), async controllerPath => {
      const controllerModule = await import(controllerPath);
      const controllerClass = controllerModule.default;

      if (controllerClass == null || (typeof controllerClass !== 'function' && typeof controllerClass !== 'object')) {
        return null;
      }

      return controllerClass;
    }, FORCE_SEQUENTIAL_MODULE_IMPORT)).filter(controllerClass => controllerClass != null);

    const apiInstances = (await awaitMapAllEntries(apiClasses, async resolverClass => {
      if (typeof resolverClass === 'function') {
        return app.instantiate(resolverClass);
      }

      return null;
    }, FORCE_SEQUENTIAL_MODULE_IMPORT)).filter(controllerInstance => controllerInstance != null);

    const routeHandlers = [...apiClasses, ...apiInstances];

    const controllerModules = [];
    for (const theClass of routeHandlers) {
      const routingMetaList = getRoutingMetadata(theClass);
      if (!routingMetaList) {
        continue;
      }

      for (const routingMeta of routingMetaList) {
        const methodName = routingMeta.handlerName;
        const classMethod = theClass[methodName];
        const routeHandler = wrapControllerWithInjectors(
          theClass,
          methodName,
          classMethod.bind(theClass),
          app,
        );

        controllerModules.push({
          method: routingMeta.httpMethod,
          path: routingMeta.path,
          handler: routeHandler,
        });
      }
    }

    return controllerModules;
  }

  _wrapError(callback: Function) {

    const that = this;

    return function wrappedError(context) {
      try {
        const val = callback(context.params || {});

        if (val == null || !val.then) {
          return that._formatSuccess(val, context);
        }

        return val.then(
          asyncVal => that._formatSuccess(asyncVal, context),
          e => formatError(e, context),
        );
      } catch (e) {
        return formatError(e, context);
      }
    };
  }

  _formatSuccess(val, context) {

    if (val === void 0) {
      val = null;
    }

    if (val != null) {
      // buffers & similar are returned raw
      if (Buffer.isBuffer(val) || typeof val.pipe === 'function') {
        return val;
      }

      // returning an error works too as an alternative to throwing
      if (val[IsRestError]) {
        return formatError(val, context);
      }
    }

    return this.entityToJson(val)
      .then(newVal => {
        return { data: newVal };
      });
  }
}

function formatError(err, context) {
  if (!err || !err[IsRestError] || !err.toJSON) {
    throw err;
  }

  context.response.status = err.status || 500;

  return {
    error: err.toJSON(),
  };
}
