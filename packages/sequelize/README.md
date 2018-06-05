# @stilt/sequelize

_Sequelize 4 Adapter for Stilt Framework_

Note: You do not have to use this plugin to use Sequelize with the Stilt framework,  
but this will be much more convenient.

## Install

`npm install sequelize @stilt/sequelize`

## Usage

Enable sequelize support like any other Stilt extension.

```javascript
import Stilt from '@stilt/core';
import StiltSequelize from '@stilt/sequelize';

const app = new Stilt();

app.use(new StiltSequelize({
  models: `${__dirname}/models`,
  databaseUri: 'postgres://ephys@localhost:5432/myblog',
  debug: false,
}));

app.launch();
```

Configuration Options:

```javascript
type Config = {
  // The directory containing the various Sequelize Models of your application
  // They will be automatically loaded by this plugin.
  models: string,

  // The URI containing all the information necessary to access the database.
  // format:
  // <dialect>://[username]:[password]@<host>:[port]/<databaseName>
  databaseUri: string,

  // Print Sequelize debug messages.
  debug?: boolean,
};
```

### Declaring your Database Models

Your models must be placed in your "models" folder. Each file can only contain one model which must be the default export.

You can declare your models similarly to how you'd declare them using [sequelize-decorators](https://www.npmjs.com/package/sequelize-decorators). The `@Options`, `@Attribute` and `@Attributes` decorators are exported directly from that package.

```javascript
import { Model, DataTypes } from 'sequelize';
import { Options, Attribute } from '@stilt/sequelize';

@Options({
    tableName: 'users'
})
@Attributes({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
})
export default class User extends Model {}
```

Note: Unline `sequelize-decorators`, you do not need to pass an instance of `sequelize` to your
`@Options` decorator. That part is handled automatically by this plugin.

### Model Associations

`@stilt/sequelize` provides you with a series of decorators that simplify the creation of associations between your models. Your can use the following decorators:

- `@BelongsTo(model, options)`
- `@HasMany(model, options)`
- `@HasOne(model, options)`
- `@BelongsToMany(model, options)`

These decorators work exactly like if you were to manually call the corresponding static method on your models with the same parameters:

```javascript
@HasMany(User)
export default class Team extends Model {}

// == is equivalent to ==

class Team extends Model {}

Team.hasMany(User);
```

### Inverse Associations

One point where the above decorators differ from vanilla Sequelize is that you can specify the parameters of the inverse
association directly in the decorator. This greatly reduces duplicated code.

Instead of doing

```javascript
// create the association User#team
@BelongsTo(Team, {
  as: 'team',
  onDelete: 'CASCADE',
  foreignKey: {
    name: 'team_id',
    allowNull: false,
  },
})
class User extends Model {
}

// create the inverse association, Team#members
Team.hasMany(User, {
  as: 'members',
  onDelete: 'CASCADE',
  foreignKey: {
    name: 'team_id',
    allowNull: false,
  },
});
```

You can now do

```javascript
@BelongsTo(Team, {
  // create the association User#team
  as: 'team',
  onDelete: 'CASCADE',
  foreignKey: {
    name: 'team_id',
    allowNull: false,
  },

  // create the inverse association, Team#members
  inverse: {
    type: 'many',
    as: 'members',
  },
})
class User extends Model {
}
```

Signatures:

```javascript
@BelongsTo(TargetModel, {
  // <sequelize parameters>

  // Added by Stilt
  inverse: {
    // "many" will create an association using hasMany
    // "one" will create an association using hasOne
    type: 'many' | 'one',

    // "as" of the inverse association
    as: string,

    // only if type = "many" (see .hasMany options for details)
    scope: boolean,

    // only if type = "many" (see .hasMany options for details)
    sourceKey: string,
 },
})

@HasOne(TargetModel, {
  // <sequelize parameters>

  // Added by Stilt
  // if value is a string, it is used for the "as" option of the inverse relation
  inverse: { as: string } | string,
})

@HasMany(TargetModel, {
  // <sequelize parameters>

  // Added by Stilt
  // if value is a string, it is used for the "as" option of the inverse relation
  inverse: { as: string } | string,
})

@BelongsToMany(TargetModel, {
  // <sequelize parameters>

  // These two parameters will be switched in the inverse association.
  foreignKey: string, // see sequelize .belongsToMany decoumentation for details
  otherKey: string,   // see sequelize .belongsToMany decoumentation for details

  // Added by Stilt
  // if value is a string, it is used for the "as" option of the inverse relation
  inverse: { as: string } | string,
})
```

### Decorator Naming

All decorators exported by this plugin are available in both `camelCase` and `UpperCamelCase` (eg. both `@HasMany` and `@hasMany` are exported).

### Credit

[sequelize-decorators](https://www.npmjs.com/package/sequelize-decorators) for the `@Options`, `@Attribute` and `@Attributes` decorators which this module exports.
