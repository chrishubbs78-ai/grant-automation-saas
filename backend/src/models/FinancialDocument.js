const { DataTypes } = require('sequelize');

// Stores financial documents (990s, audits, budgets) in the database.
// Sensitive flag controls extra access restrictions at the route layer.
module.exports = (sequelize) => {
  const FinancialDocument = sequelize.define('FinancialDocument', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    org_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'organizations', key: 'id' }
    },
    document_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '990, audit, budget, balance_sheet, irs_letter, board_list, other'
    },
    file_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Stored identifier'
    },
    original_name: {
      type: DataTypes.STRING(255),
      comment: 'User-facing filename'
    },
    mime_type: {
      type: DataTypes.STRING(100)
    },
    // Base64-encoded file content stored in DB.
    // For production, swap this for an S3 key and store content in object storage.
    file_data: {
      type: DataTypes.TEXT,
      comment: 'Base64-encoded file content'
    },
    file_size_bytes: {
      type: DataTypes.INTEGER
    },
    fiscal_year: {
      type: DataTypes.INTEGER,
      comment: 'Year this document covers (e.g. 2024)'
    },
    description: {
      type: DataTypes.TEXT
    },
    is_sensitive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Sensitive docs require ownership check; non-sensitive may be shared with reviewers'
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
    tableName: 'financial_documents',
    timestamps: false
  });

  FinancialDocument.associate = (models) => {
    FinancialDocument.belongsTo(models.Organization, { foreignKey: 'org_id', as: 'organization' });
  };

  return FinancialDocument;
};
