const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserCommunity = sequelize.define('UserCommunity', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  community_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'communities',
      key: 'id'
    }
  },
  joined_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'user_communities',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'community_id']
    }
  ]
});

module.exports = UserCommunity;