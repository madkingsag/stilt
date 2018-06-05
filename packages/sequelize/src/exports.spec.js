// @flow

import * as seqExports from './';

describe('@stilt/sequelize', () => {

  it('Exports belongsTo', () => {
    expect(seqExports.belongsTo).toBeDefined();
    expect(seqExports.BelongsTo).toBeDefined();
  });

  it('Exports belongsToMany', () => {
    expect(seqExports.belongsToMany).toBeDefined();
    expect(seqExports.BelongsToMany).toBeDefined();
  });

  it('Exports hasOne', () => {
    expect(seqExports.hasOne).toBeDefined();
    expect(seqExports.HasOne).toBeDefined();
  });

  it('Exports hasMany', () => {
    expect(seqExports.hasMany).toBeDefined();
    expect(seqExports.HasMany).toBeDefined();
  });

  it('Exports Options', () => {
    expect(seqExports.options).toBeDefined();
    expect(seqExports.Options).toBeDefined();
  });

  it('Exports Attributes', () => {
    expect(seqExports.attributes).toBeDefined();
    expect(seqExports.Attributes).toBeDefined();
  });

  it('Exports Attribute', () => {
    expect(seqExports.attribute).toBeDefined();
    expect(seqExports.Attributes).toBeDefined();
  });

  it('Exports StiltSequelize', () => {
    expect(seqExports.default).toBeDefined();
    expect(seqExports.default.name).toEqual('StiltSequelize');
  });
});
