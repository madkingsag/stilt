import isCallable from 'is-callable';
import type {
  ModelAttributes,
  ModelStatic,
  ModelOptions,
  BelongsToOptions as SequelizeBelongsToOptions,
  HasOneOptions as SequelizeHasOneOptions,
  HasManyOptions as SequelizeHasManyOptions,
  BelongsToManyOptions as SequelizeBelongsToManyOptions,
  ThroughOptions,
} from 'sequelize';

const METADATA = Symbol('stilt-sequelize-metadata');

type SequelizeAs = string | { singular: string, plural: string };

type AssociationType = string;

type AssociationOptions = BelongsToAssociationOptions | HasOneAssociationOptions
  | HasManyAssociationOptions | BelongsToManyAssociationOptions;

type GetSymmetricalAssociationFunc = (AssociationOptions) => null | ({
  type: AssociationType,
  options: AssociationOptions,
});

type AssociationTag = {
  sourceModel: ModelStatic<any>,
  targetModel: ModelStatic<any> | (() => ModelStatic<any>),
  associationType: AssociationType,
  getSymmetricalAssociation: GetSymmetricalAssociationFunc,
  associationOptions: AssociationOptions,
};

type SequelizeAssociationMeta = {
  model: ModelStatic<any>,
  type: string,
  parameters: any[],
};

// TODO: replace with Array.prototype.flat when available
function flat<T>(arr: T[][]): T[] {
  const result = [];

  for (const item of arr) {
    result.push(...item);
  }

  return result;
}

function getAssociationMeta(models: Array<ModelStatic<any>>): SequelizeAssociationMeta[] {
  const associations: SequelizeAssociationMeta[] = [];
  const associationTags: AssociationTag[] = flat(models
    .map(model => model[METADATA])
    .filter(tags => tags != null));

  for (const associationTag of associationTags) {
    const { sourceModel, associationType, getSymmetricalAssociation } = associationTag;
    const associationOptions: AssociationOptions = { ...associationTag.associationOptions };

    /*
    * lazy-load models (so decorators can reference the decorated model using a function), eg:
    * @BelongsTo(() => User)
    * class User extends Model{}
    */
    const targetModel: ModelStatic<any> = isPureFunction(associationTag.targetModel)
      ? associationTag.targetModel()
      : associationTag.targetModel;

    // lazy-load association.through
    // @ts-expect-error
    if (associationOptions.through && isPureFunction(associationOptions.through)) {
      // @ts-expect-error
      associationOptions.through = associationOptions.through();
    }

    associations.push({
      model: sourceModel,
      type: associationType,
      parameters: [targetModel, associationOptions],
    });

    // create association on target model too.
    const inverseAssoc = getSymmetricalAssociation(associationOptions);
    if (inverseAssoc != null) {

      associations.push({
        model: targetModel,
        type: inverseAssoc.type,
        parameters: [sourceModel, inverseAssoc.options],
      });
    }
  }

  return associations;
}

function tagAssociation(model, associationMeta: AssociationTag) {
  if (!model[METADATA]) {
    model[METADATA] = [];
  }

  model[METADATA].push(associationMeta);
}

interface PureFunction {
  (): any;
}

function isPureFunction(func: Function): func is PureFunction {
  return isCallable(func) && Object.getPrototypeOf(func) === Function.prototype;
}

// Make associations two-way.
function makeAssociationDecorator<AnyAssociationOpts extends AssociationOptions>(
  associationType,
  { getSymmetricalAssociation },
) {
  return function createAssociation(targetModel, associationOptions?: AnyAssociationOpts) {
    return function decorate(sourceModel) {

      if (!associationOptions) {
        // @ts-expect-error
        associationOptions = {};
      }

      // register metadata now, resolve later
      // so models can be lazy-resolved
      tagAssociation(sourceModel, {
        associationType,
        getSymmetricalAssociation,
        sourceModel,
        targetModel,
        associationOptions,
      });

      return sourceModel;
    };
  };
}

type BelongsToAssociationOptions = SequelizeBelongsToOptions & {
  // Added by Stilt
  inverse?: {
    type: 'many' | 'one',
    as?: SequelizeAs,
    scope?: boolean, // ONLY IF "many"
    sourceKey?: string, // ONLY IF "many"
  },
};

/*
 * @BelongsTo(B, optSource = {
 *   hooks: boolean,
 *   foreignKey: string,
 *   onDelete: string,
 *   onUpdate: string,
 *   constraints: boolean,
 *
 *   as: string,
 *
 *   // Added by Stilt
 *   inverse: {
 *     type: 'many' | 'one',
 *     as: string,
 *     scope: boolean, // ONLY IF "many"
 *     sourceKey: string // ONLY IF "many"
 *   },
 * })
 * class A {}
 *
 * - Adds:
 *  - A#b_id
 *  - A#getB()
 *  - A#setB()
 *  - A#createB()
 *
 * Inverse Association (depending on many VS one per B):
 *
 * if inverse.type === 'one'
 * - B.HasOne(A, {
 *   hooks: optSource.hooks,
 *   foreignKey: optSource.foreignKey,
 *   onDelete: optSource.onDelete,
 *   onUpdate: optSource.onUpdate,
 *   constraints: optSource.constraints,
 *
 *   as: optSource.inverse.as,
 * })
 *
 * if inverse.type === 'many'
 * - B.HasMany(A, {
 *   hooks: optSource.hooks,
 *   foreignKey: optSource.foreignKey,
 *   onDelete: optSource.onDelete,
 *   onUpdate: optSource.onUpdate,
 *   constraints: optSource.constraints,
 *
 *   as: optSource.inverse.as,
 *   sourceKey: optSource.inverse.sourceKey,
 *   scope: optSource.inverse.scope,
 * })
 */
const BelongsTo = makeAssociationDecorator<BelongsToAssociationOptions>('belongsTo', {

  getSymmetricalAssociation(sourceParams) {

    const inverse = sourceParams.inverse;

    // delete "inverse" extra property from sourceParams as it is not accepted by sequelize
    delete sourceParams.inverse;

    // inverse is null, user does not want to add inverse association.
    if (inverse == null) {
      return null;
    }

    if (typeof inverse !== 'object') {
      throw new TypeError('@BelongsTo "inverse" property must be an object');
    }

    // delete type from "inverse" so it does not get assigned when overriding for inverse association
    const type = inverse.type;
    delete inverse.type;

    if (!['many', 'one'].includes(type)) {
      throw new Error('@BelongsTo "inverse.type" property must be either "many" or "one"');
    }

    // copy sourceParams for inverse params and override them with the contents of "inverse"
    const inverseOptions = Object.assign({}, sourceParams);

    // as is optional in sequelize, delete the one in inverseParam before assigning overrides
    // just in case the override does not specify it.
    delete inverseOptions.as;

    // override using the contents of sourceParams.inverse
    Object.assign(inverseOptions, inverse);

    return {
      type: type === 'many' ? 'hasMany' : 'hasOne',
      options: inverseOptions,
    };
  },
});

type HasOneAssociationOptions = SequelizeHasOneOptions & {
  // Added by Stilt
  inverse?: {
    as: SequelizeAs,
  } | SequelizeAs,
};

/*
 * @HasOne(B, optSource = {
 *   hooks: boolean,
 *   as: string,
 *   foreignKey: string,
 *   onDelete: string,
 *   onUpdate: string,
 *   constraints: boolean,
 *
 *   // Added by Stilt
 *   inverse: {
 *     as: string,
 *   },
 * })
 * class A {}
 *
 * - Adds:
 * - B#a_id
 * - A#getB()
 * - A#setB()
 * - A#createB()
 *
 * Inverse Association:
 * - B.BelongsTo(A, {
 *   hooks: optSource.hooks,
 *   foreignKey: optSource.foreignKey,
 *   onDelete: optSource.onDelete,
 *   onUpdate: optSource.onUpdate,
 *   constraints: optSource.constraints,
 *
 *   as: optSource.inverse.as,
 * })
 */
const HasOne = makeAssociationDecorator<HasOneAssociationOptions>('hasOne', {

  getSymmetricalAssociation: getSymmetricalHasAssociation,
});

function getSymmetricalHasAssociation(sourceParams) {

  const inverse = sourceParams.inverse;

  // delete "inverse" extra property from sourceParams as it is not accepted by sequelize
  delete sourceParams.inverse;

  // inverse is null, user does not want to add inverse association.
  if (inverse == null) {
    return null;
  }

  if (typeof inverse !== 'object' && typeof inverse !== 'string') {
    throw new TypeError('@BelongsTo "inverse" property must be an object or string');
  }

  // copy sourceParams for inverse params and override them with the contents of "inverse"
  const inverseOptions = Object.assign({}, sourceParams);

  // as is optional in sequelize, delete the one in inverseParam before assigning overrides
  // just in case the override does not specify it.
  delete inverseOptions.as;

  // override using the contents of sourceParams.inverse
  if (typeof inverse === 'string') {
    inverseOptions.as = inverse;
  } else {
    Object.assign(inverseOptions, inverse);
  }

  return {
    type: 'belongsTo',
    options: inverseOptions,
  };
}

type HasManyAssociationOptions = SequelizeHasManyOptions & {
  // Added by Stilt
  inverse?: {
    as: SequelizeAs,
  } | SequelizeAs,
};

/*
 * A.HasMany(B, optSource = {
 *   hooks: string,
 *   as: string,
 *   scope: string,
 *   onDelete: string,
 *   onUpdate: string,
 *   constraints: boolean,
 *   foreignKey: string,
 *   sourceKey: string,
 *
 *   // Added by Stilt
 *   inverse: {
 *     as: string,
 *   },
 * })
 *
 * - Adds:
 *  - B#a_id
 *  - A#getBs()
 *  - A#setBs()
 *  - A#createB()
 *  - A#addB()
 *  - A#addBs()
 *  - A#countBs()
 *  - A#removeB()
 *  - A#removeBs()
 *  - A#hasB()
 *  - A#hasBs()
 *
 * Inverse Association:
 * - B.BelongsTo(A, {
 *   hooks: optSource.hooks,
 *   foreignKey: optSource.foreignKey,
 *   onDelete: optSource.onDelete,
 *   onUpdate: optSource.onUpdate,
 *   constraints: optSource.constraints,
 *
 *   as: optSource.inverse.as,
 * })
 */
const HasMany = makeAssociationDecorator<HasManyAssociationOptions>('hasMany', {
  getSymmetricalAssociation: getSymmetricalHasAssociation,
});

type BelongsToManyAssociationOptions = Omit<SequelizeBelongsToManyOptions, 'through'> & {
  // add support for lazy-loading of models
  through: string | ModelStatic<any> | ThroughOptions | (() => ModelStatic<any> | ThroughOptions),

  // Added by stilt
  inverse?: {
    as: SequelizeAs,
  },
};
/*
 * A.BelongsToMany(B, optSource = {
 *   // common
 *   hooks: boolean,
 *   scope: string,
 *   timestamps: boolean,
 *   onDelete: string,
 *   onUpdate: string,
 *   constraints: boolean,
 *   through: string | Model,
 *
 *   // to invert
 *   foreignKey: string,
 *   otherKey: string,
 *
 *   // Only first side
 *   as: string,
 *
 *   // Added by framework
 *   inverse: {
 *     as: string,
 *   },
 * })
 *
 * - Creates intermediate table
 *
 * Inverse Association:
 * - B.BelongsToMany(A, {
 *   ...common,
 *   otherKey: optSource.foreignKey,
 *   foreignKey: optSource.otherKey,
 *   as: optSource.inverse.as,
 * })
 */
const BelongsToMany = makeAssociationDecorator<BelongsToManyAssociationOptions>('belongsToMany', {

  getSymmetricalAssociation(sourceParams: BelongsToManyAssociationOptions) {

    const inverse = sourceParams.inverse;

    // delete "inverse" extra property from sourceParams as it is not accepted by sequelize
    delete sourceParams.inverse;

    // inverse is null, user does not want to add inverse association.
    if (inverse == null) {
      return null;
    }

    if (typeof inverse !== 'object' && typeof inverse !== 'string') {
      throw new TypeError('@BelongsTo "inverse" property must be an object or string');
    }

    // copy sourceParams for inverse params and override them with the contents of "inverse"
    const inverseParams = Object.assign({}, sourceParams);

    // invert keys
    // TODO: what about "sourceKey"?
    inverseParams.foreignKey = sourceParams.otherKey;
    inverseParams.otherKey = sourceParams.foreignKey;

    // as is optional in sequelize, delete the one in inverseParam before assigning overrides
    // just in case the override does not specify it.
    delete inverseParams.as;

    // override using the contents of sourceParams.inverse
    if (typeof inverse === 'string') {
      inverseParams.as = inverse;
    } else {
      Object.assign(inverseParams, inverse);
    }

    return {
      type: 'belongsToMany',
      options: inverseParams,
    };
  },
});

const SequelizeOptions = Symbol('sequelize-options');
const SequelizeAttributes = Symbol('sequelize-attributes');

function Options(options: ModelOptions) {
  return function decorate(model: ModelStatic<any>) {
    Object.defineProperty(model, SequelizeOptions, {
      value: options,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  };
}

function Attributes(attributes: ModelAttributes) {
  return function decorate(model: ModelStatic<any>) {
    Object.defineProperty(model, SequelizeAttributes, {
      value: attributes,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  };
}

export function getModelInitData(model: ModelStatic<any>): { options: Object, attributes: Object } {
  return {
    options: model[SequelizeOptions] || {},
    attributes: model[SequelizeAttributes] || {},
  };
}

export {
  getAssociationMeta,
  BelongsTo,
  BelongsToMany,
  HasOne,
  HasMany,
  Options,
  Attributes,
};

export type {
  HasOneAssociationOptions,
  BelongsToAssociationOptions,
  HasManyAssociationOptions,
  BelongsToManyAssociationOptions,
};
