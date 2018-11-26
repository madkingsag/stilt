// @flow

import { getAssociationMeta, HasMany, BelongsToMany, BelongsTo, HasOne } from './decorators';

function getAssociations(model) {
  const meta = getAssociationMeta(model);

  if (meta == null) {
    return [];
  }

  return meta.associations || [];
}

describe('@BelongsTo', () => {
  it('Adds association metadata of type "belongsTo" for later initialization', () => {

    class B {}

    @BelongsTo(B)
    class A {}

    expect(getAssociations(A)).toEqual([{
      type: 'belongsTo',
      parameters: [B, {}],
    }]);

    expect(getAssociations(B)).toEqual([]);
  });

  it('Accepts parameters', () => {

    class B {}

    @BelongsTo(B, {
      as: 'b',
    })
    class A {}

    expect(getAssociations(A)).toEqual([{
      type: 'belongsTo',
      parameters: [B, { as: 'b' }],
    }]);

    expect(getAssociations(B)).toEqual([]);
  });

  it('Can generate inverse association 1:1 (hasOne)', () => {

    class B {}

    @BelongsTo(B, {
      as: 'b',

      inverse: {
        type: 'one',
      },
    })
    class A {}

    expect(getAssociations(A)).toEqual([{
      type: 'belongsTo',
      parameters: [B, { as: 'b' }],
    }]);

    expect(getAssociations(B)).toEqual([{
      type: 'hasOne',
      parameters: [A, {}],
    }]);
  });

  it('Can generate inverse association 1:m (hasMany)', () => {

    class B {}

    @BelongsTo(B, {
      as: 'b',

      inverse: {
        type: 'many',
      },
    })
    class A {}

    expect(getAssociations(A)).toEqual([{
      type: 'belongsTo',
      parameters: [B, { as: 'b' }],
    }]);

    expect(getAssociations(B)).toEqual([{
      type: 'hasMany',
      parameters: [A, {}],
    }]);
  });

  it('"inverse" option cannot be a string as type needs to be defined', () => {

    class B {}

    try {
      @BelongsTo(B, {
        as: 'b',
        inverse: 'a',
      })
      // eslint-disable-next-line no-unused-vars
      class A {}
    } catch (e) {
      expect(e.message).toEqual('@BelongsTo "inverse" property must be an object');
    }
  });

  it('Allows overriding options of inverse association', () => {

    class B {}

    @BelongsTo(B, {
      as: 'b',

      inverse: {
        type: 'one',
        as: 'a',
      },
    })
    class A {}

    expect(getAssociations(A)).toEqual([{
      type: 'belongsTo',
      parameters: [B, { as: 'b' }],
    }]);

    expect(getAssociations(B)).toEqual([{
      type: 'hasOne',
      parameters: [A, { as: 'a' }],
    }]);
  });
});

describe('@HasOne', () => {
  it('Adds association metadata of type "hasOne" for later initialization', () => {

    class B {}

    @HasOne(B)
    class A {}

    expect(getAssociations(A)).toEqual([{
      type: 'hasOne',
      parameters: [B, {}],
    }]);

    expect(getAssociations(B)).toEqual([]);
  });

  it('Accepts parameters', () => {

    class B {}

    @HasOne(B, {
      as: 'b',
    })
    class A {}

    expect(getAssociations(A)).toEqual([{
      type: 'hasOne',
      parameters: [B, { as: 'b' }],
    }]);

    expect(getAssociations(B)).toEqual([]);
  });

  it('Can generate inverse association (belongsTo)', () => {

    class B {}

    @HasOne(B, {
      as: 'b',
      inverse: {
        as: 'a',
      },
    })
    class A {}

    expect(getAssociations(A)).toEqual([{
      type: 'hasOne',
      parameters: [B, { as: 'b' }],
    }]);

    expect(getAssociations(B)).toEqual([{
      type: 'belongsTo',
      parameters: [A, { as: 'a' }],
    }]);
  });

  it('"inverse" option as a string is an alias for "as"', () => {

    class B {}

    @HasOne(B, {
      as: 'b',
      inverse: 'a',
    })
    class A {}

    expect(getAssociations(A)).toEqual([{
      type: 'hasOne',
      parameters: [B, { as: 'b' }],
    }]);

    expect(getAssociations(B)).toEqual([{
      type: 'belongsTo',
      parameters: [A, { as: 'a' }],
    }]);
  });
});

describe('@BelongsToMany', () => {
  it('Adds association metadata of type "belongsToMany" for later initialization', () => {

    class B {}

    @BelongsToMany(B)
    class A {}

    expect(getAssociations(A)).toEqual([{
      type: 'belongsToMany',
      parameters: [B, {}],
    }]);

    expect(getAssociations(B)).toEqual([]);
  });

  it('Accepts parameters', () => {

    class B {}

    @BelongsToMany(B, {
      as: 'b',
      through: 'a_to_b',
    })
    class A {}

    expect(getAssociations(A)).toEqual([{
      type: 'belongsToMany',
      parameters: [B, {
        as: 'b',
        through: 'a_to_b',
      }],
    }]);

    expect(getAssociations(B)).toEqual([]);
  });

  it('Can generate inverse association (belongsToMany)', () => {

    class B {}

    @BelongsToMany(B, {
      as: 'b',
      through: 'a_to_b',
      foreignKey: 'a_id',
      otherKey: 'b_id',

      inverse: {
        as: 'a',
      },
    })
    class A {}

    expect(getAssociations(A)).toEqual([{
      type: 'belongsToMany',
      parameters: [B, {
        as: 'b',
        through: 'a_to_b',
        foreignKey: 'a_id',
        otherKey: 'b_id',
      }],
    }]);

    expect(getAssociations(B)).toEqual([{
      type: 'belongsToMany',
      parameters: [A, {
        as: 'a',
        through: 'a_to_b',
        otherKey: 'a_id',
        foreignKey: 'b_id',
      }],
    }]);
  });

  it('"inverse" option as a string is an alias for "as"', () => {

    class B {}

    @HasMany(B, {
      as: 'b',
      through: 'a_to_b',

      inverse: 'a',
    })
    class A {}

    expect(getAssociations(A)).toEqual([{
      type: 'hasMany',
      parameters: [B, {
        as: 'b',
        through: 'a_to_b',
      }],
    }]);

    expect(getAssociations(B)).toEqual([{
      type: 'belongsTo',
      parameters: [A, {
        as: 'a',
        through: 'a_to_b',
      }],
    }]);
  });
});

describe('@HasMany', () => {
  it('Adds association metadata of type "hasMany" for later initialization', () => {

    class B {}

    @HasMany(B)
    class A {}

    expect(getAssociations(A)).toEqual([{
      type: 'hasMany',
      parameters: [B, {}],
    }]);

    expect(getAssociations(B)).toEqual([]);
  });

  it('Accepts parameters', () => {

    class B {}

    @HasMany(B, {
      as: 'b',
    })
    class A {}

    expect(getAssociations(A)).toEqual([{
      type: 'hasMany',
      parameters: [B, { as: 'b' }],
    }]);

    expect(getAssociations(B)).toEqual([]);
  });

  it('Can generate inverse association (belongsTo)', () => {

    class B {}

    @HasMany(B, {
      as: 'b',
      inverse: {
        as: 'a',
      },
    })
    class A {}

    expect(getAssociations(A)).toEqual([{
      type: 'hasMany',
      parameters: [B, { as: 'b' }],
    }]);

    expect(getAssociations(B)).toEqual([{
      type: 'belongsTo',
      parameters: [A, { as: 'a' }],
    }]);
  });

  it('"inverse" option as a string is an alias for "as"', () => {

    class B {}

    @HasMany(B, {
      as: 'b',
      inverse: 'a',
    })
    class A {}

    expect(getAssociations(A)).toEqual([{
      type: 'hasMany',
      parameters: [B, { as: 'b' }],
    }]);

    expect(getAssociations(B)).toEqual([{
      type: 'belongsTo',
      parameters: [A, { as: 'a' }],
    }]);
  });
});
