const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BulkJob = sequelize.define('BulkJob', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    org_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },
    operation_type: {
      type: DataTypes.ENUM('bulk_update_status', 'bulk_export_csv', 'bulk_import_rfps'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('queued', 'processing', 'complete', 'error'),
      defaultValue: 'queued'
    },
    total_items: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    processed_items: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    error_message: {
      type: DataTypes.TEXT
    },
    result_url: {
      type: DataTypes.TEXT,
      comment: 'URL to download result (CSV, etc.) or null if operation still processing'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Stores operation-specific metadata: {grant_ids, status_value, file_path, etc.}'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'bulk_jobs',
    timestamps: true,
    underscored: true
  });

  return BulkJob;
};
