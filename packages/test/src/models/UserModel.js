// @flow

import { Model, DataTypes } from 'sequelize';
import { Options, Attributes, BelongsToMany } from '@stilt/sequelize';
import Book from './BookModel';

@Options({
  tableName: 'stilt_users',
  freezeTableName: true,
  underscored: true,
})
@Attributes({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING(512).BINARY,
    allowNull: true,
  },
  createdAt: { type: DataTypes.DATE, field: 'created_at' },
  updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
})
@BelongsToMany(Book, {
  as: 'author',
  onDelete: 'CASCADE',
  through: 'mgcs_store_chain_managers',
})
export default class User extends Model {

}
