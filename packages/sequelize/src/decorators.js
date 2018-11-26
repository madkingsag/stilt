// @flow

import { type Model } from 'sequelize';

const METADATA = Symbol('stilt-sequelize-metadata');

type AssociationMeta = {
  associations: ?SequelizeAssociationMeta[],
};

type SequelizeAssociationMeta = {
  type: string,
  parameters: any[],
};

function getSetMeta(target): AssociationMeta {
  if (!target[METADATA]) {
    target[METADATA] = Object.create(null);
  }

  return target[METADATA];
}

function getAssociationMeta(target): ?AssociationMeta {
  return target[METADATA];
}

function addAssociation(model, association) {
  const meta = getSetMeta(model);
  meta.associations = meta.associations || [];

  meta.associations.push(association);
}

// Make associations two-way.
function makeAssociationDecorator(associationType, options) {
  return function createAssociation(targetModel, associationOptions) {
    return function decorate(sourceModel) {

      if (!associationOptions) {
        associationOptions = {};
      }

      addAssociation(sourceModel, {
        type: associationType,
        parameters: [targetModel, associationOptions],
      });

      // create association on target model too.
      const inverseAssoc = options.getSymmetricalAssociation(associationOptions);
      if (inverseAssoc != null) {

        addAssociation(targetModel, {
          type: inverseAssoc.type,
          parameters: [sourceModel, inverseAssoc.options],
        });
      }

      return sourceModel;
    };
  };
}

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
const BelongsTo = makeAssociationDecorator('belongsTo', {

  getSymmetricalAssociation(sourceParams) {

    const inverse = sourceParams.inverse;

    // delete "inverse" extra property from sourceParams as it is not accepted by sequelize
    delete sourceParams.inverse;

    // inverse is null, user does not want to add inverse association.
    if (inverse == null) {
      return null;
    }

    if (typeof inverse !== 'object') {
      throw new Error('@BelongsTo "inverse" property must be an object');
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
const HasOne = makeAssociationDecorator('hasOne', {

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
    throw new Error('@BelongsTo "inverse" property must be an object or string');
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
const HasMany = makeAssociationDecorator('hasMany', {

  getSymmetricalAssociation: getSymmetricalHasAssociation,
});

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
const BelongsToMany = makeAssociationDecorator('belongsToMany', {

  getSymmetricalAssociation(sourceParams) {

    const inverse = sourceParams.inverse;

    // delete "inverse" extra property from sourceParams as it is not accepted by sequelize
    delete sourceParams.inverse;

    // inverse is null, user does not want to add inverse association.
    if (inverse == null) {
      return null;
    }

    if (typeof inverse !== 'object' && typeof inverse !== 'string') {
      throw new Error('@BelongsTo "inverse" property must be an object or string');
    }

    // copy sourceParams for inverse params and override them with the contents of "inverse"
    const inverseParams = Object.assign({}, sourceParams);

    // invert keys
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

function Options(options) {
  return function decorate(model: Model) {
    Object.defineProperty(model, SequelizeOptions, {
      value: options,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  };
}

function Attributes(attributes) {
  return function decorate(model: Model) {
    Object.defineProperty(model, SequelizeAttributes, {
      value: attributes,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  };
}

export function getModelInitData(model: Model): { options: Object, attributes: Object } {
  return {
    options: model[SequelizeOptions] || {},
    attributes: model[SequelizeAttributes] || {},
  };
}

export const belongsTo = BelongsTo;
export const belongsToMany = BelongsToMany;
export const hasOne = HasOne;
export const hasMany = HasMany;

export {
  getAssociationMeta,
  BelongsTo,
  BelongsToMany,
  HasOne,
  HasMany,
  Options,
  Options as options,
  Attributes,
  Attributes as attributes,
};
