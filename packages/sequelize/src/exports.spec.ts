import * as seqExports from '.';

describe('@stilt/sequelize', () => {

  it('Exports belongsTo', () => {
    expect(seqExports.BelongsTo).toBeDefined();
  });

  it('Exports belongsToMany', () => {
    expect(seqExports.BelongsToMany).toBeDefined();
  });

  it('Exports hasOne', () => {
    expect(seqExports.HasOne).toBeDefined();
  });

  it('Exports hasMany', () => {
    expect(seqExports.HasMany).toBeDefined();
  });

  it('Exports Options', () => {
    expect(seqExports.Options).toBeDefined();
  });

  it('Exports Attributes', () => {
    expect(seqExports.Attributes).toBeDefined();
  });

  it('Exports StiltSequelize', () => {
    expect(seqExports.StiltSequelize).toBeDefined();
    expect(seqExports.StiltSequelize.name).toBe('StiltSequelize');
  });
});
