const { DataTypes } = require('sequelize');

/**
 * One Google account linked to an organization. The refresh token is stored
 * encrypted (see utils/tokenCrypto) and never returned by any route.
 */
module.exports = (sequelize) => {
  const GoogleConnection = sequelize.define('GoogleConnection', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    org_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'organizations', key: 'id' }
    },
    google_email: { type: DataTypes.STRING(255) },
    scopes: { type: DataTypes.JSONB, defaultValue: [] },
    refresh_token_enc: { type: DataTypes.TEXT, allowNull: false },
    access_token_enc: { type: DataTypes.TEXT },
    access_token_expires_at: { type: DataTypes.DATE },
    drive_folder_id: {
      type: DataTypes.STRING(255),
      comment: 'Folder the tool creates to hold application copies'
    },
    calendar_id: {
      type: DataTypes.STRING(255),
      defaultValue: 'primary'
    },
    last_error: { type: DataTypes.TEXT }
  }, {
    tableName: 'google_connections',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return GoogleConnection;
};
