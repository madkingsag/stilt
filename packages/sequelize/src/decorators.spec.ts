import { getAssociationMeta as getAssociations, HasMany, BelongsToMany, BelongsTo, HasOne } from './decorators.js';

describe('@BelongsTo', () => {
  it('Adds association metadata of type "belongsTo" for later initialization', () => {

    class B {}

    @BelongsTo(B)
    class A {}

    expect(getAssociations([A, B])).toEqual([{
      model: A,
      type: 'belongsTo',
      parameters: [B, {}],
    }]);
  });

  it('Accepts parameters', () => {

    class B {}

    @BelongsTo(B, {
      as: 'b',
    })
    class A {}

    expect(getAssociations([A, B])).toEqual([{
      model: A,
      type: 'belongsTo',
      parameters: [B, { as: 'b' }],
    }]);
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

    expect(getAssociations([A, B])).toEqual([{
      model: A,
      type: 'belongsTo',
      parameters: [B, { as: 'b' }],
    }, {
      model: B,
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

    expect(getAssociations([A, B])).toEqual([{
      model: A,
      type: 'belongsTo',
      parameters: [B, { as: 'b' }],
    }, {
      model: B,
      type: 'hasMany',
      parameters: [A, {}],
    }]);
  });

  it('"inverse" option cannot be a string as type needs to be defined', () => {

    class B {}

    expect(() => {
      @BelongsTo(B, {
        as: 'b',
        // @ts-expect-error
        inverse: 'a',
      })
      class A {}

      getAssociations([A]);
    }).toThrow('@BelongsTo "inverse" property must be an object');
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

    expect(getAssociations([A, B])).toEqual([{
      model: A,
      type: 'belongsTo',
      parameters: [B, { as: 'b' }],
    }, {
      model: B,
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

    expect(getAssociations([A, B])).toEqual([{
      model: A,
      type: 'hasOne',
      parameters: [B, {}],
    }]);
  });

  it('Accepts parameters', () => {

    class B {}

    @HasOne(B, {
      as: 'b',
    })
    class A {}

    expect(getAssociations([A, B])).toEqual([{
      model: A,
      type: 'hasOne',
      parameters: [B, { as: 'b' }],
    }]);
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

    expect(getAssociations([A, B])).toEqual([{
      model: A,
      type: 'hasOne',
      parameters: [B, { as: 'b' }],
    }, {
      model: B,
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

    expect(getAssociations([A, B])).toEqual([{
      model: A,
      type: 'hasOne',
      parameters: [B, { as: 'b' }],
    }, {
      model: B,
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

    expect(getAssociations([A, B])).toEqual([{
      model: A,
      type: 'belongsToMany',
      parameters: [B, {}],
    }]);
  });

  it('Accepts parameters', () => {

    class B {}

    @BelongsToMany(B, {
      as: 'b',
      through: 'a_to_b',
    })
    class A {}

    expect(getAssociations([A, B])).toEqual([{
      model: A,
      type: 'belongsToMany',
      parameters: [B, {
        as: 'b',
        through: 'a_to_b',
      }],
    }]);
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

    expect(getAssociations([A, B])).toEqual([{
      model: A,
      type: 'belongsToMany',
      parameters: [B, {
        as: 'b',
        through: 'a_to_b',
        foreignKey: 'a_id',
        otherKey: 'b_id',
      }],
    }, {
      model: B,
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
      inverse: 'a',
    })
    class A {}

    expect(getAssociations([A, B])).toEqual([{
      model: A,
      type: 'hasMany',
      parameters: [B, {
        as: 'b',
      }],
    }, {
      model: B,
      type: 'belongsTo',
      parameters: [A, {
        as: 'a',
      }],
    }]);
  });
});

describe('@HasMany', () => {
  it('Adds association metadata of type "hasMany" for later initialization', () => {

    class B {}

    @HasMany(B)
    class A {}

    expect(getAssociations([A, B])).toEqual([{
      model: A,
      type: 'hasMany',
      parameters: [B, {}],
    }]);
  });

  it('Accepts parameters', () => {

    class B {}

    @HasMany(B, {
      as: 'b',
    })
    class A {}

    expect(getAssociations([A, B])).toEqual([{
      model: A,
      type: 'hasMany',
      parameters: [B, { as: 'b' }],
    }]);
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

    expect(getAssociations([A, B])).toEqual([{
      model: A,
      type: 'hasMany',
      parameters: [B, { as: 'b' }],
    }, {
      model: B,
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

    expect(getAssociations([A, B])).toEqual([{
      model: A,
      type: 'hasMany',
      parameters: [B, { as: 'b' }],
    }, {
      model: B,
      type: 'belongsTo',
      parameters: [A, { as: 'a' }],
    }]);
  });
});
