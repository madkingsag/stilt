// @flow

import { Model, DataTypes } from 'sequelize';
import { Options, Attributes } from '@stilt/sequelize';

@Options({
  tableName: 'stilt_books',
  freezeTableName: true,
  underscored: true,
})
@Attributes({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  createdAt: { type: DataTypes.DATE, field: 'created_at' },
  updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
})
export default class Book extends Model {

}
