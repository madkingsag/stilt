// @flow

import { hasOwnProperty } from '@stilt/util';
import { Options as optionsDecorator } from 'sequelize-decorators';

const METADATA = Symbol('stilt-sequelize-metadata');

type DbMetaStruct = {
  relationships: ?SequelizeRelationship[],
};

type SequelizeRelationship = {
  name: string,
  args: any[],
};

function getSetMeta(target): DbMetaStruct {
  if (!target[METADATA]) {
    target[METADATA] = Object.create(null);
  }

  return target[METADATA];
}

export function getDbMeta(target): ?DbMetaStruct {
  return target[METADATA];
}

// TODO safeguards against existing relationships
// Make relationships two-way.
function makeRelationDecorator(name) {
  return function createRelation(...args) {
    return function decorateRelation(Model) {
      const meta = getSetMeta(Model);
      meta.relationships = meta.relationships || [];

      meta.relationships.push({
        name,
        args,
      });

      return Model;
    };
  };
}

export const BelongsTo = makeRelationDecorator('belongsTo');
export const BelongsToMany = makeRelationDecorator('belongsToMany');
export const HasMany = makeRelationDecorator('hasMany');

export { Attribute, Attributes } from 'sequelize-decorators';

export function Options(params) {

  if (!hasOwnProperty(params, 'sequelize')) {
    Object.defineProperty(params, 'sequelize', {
      get() {
        if (!Options.currentSequelize) {
          throw new Error('Model is being loaded before Sequelize had a chance to initialize.');
        }

        return Options.currentSequelize;
      },
    });
  }

  return optionsDecorator(params);
}
