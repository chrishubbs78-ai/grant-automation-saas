const { DataTypes } = require('sequelize');

/**
 * A document one specific application requires.
 *
 * Distinct from FinancialDocument, which is the org-level vault (your 990,
 * your audit — one copy, reused everywhere). This is the per-application
 * checklist: what THIS funder asks for, whether you have it yet, and the file
 * itself when it is application-specific (a tailored budget, a letter of
 * support naming this project).
 *
 * A vault document can be pointed at instead of re-uploaded — see
 * financial_document_id.
 */
module.exports = (sequelize) => {
  const ApplicationDocument = sequelize.define('ApplicationDocument', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    grant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'grants', key: 'id' },
      onDelete: 'CASCADE'
    },
    org_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'organizations', key: 'id' }
    },
    label: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'What the funder calls it, e.g. "IRS determination letter"'
    },
    description: {
      type: DataTypes.TEXT,
      comment: 'Any specifics the funder stated — page limits, format, signatories'
    },
    required: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'False for optional attachments the funder merely invites'
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'needed',
      comment: 'needed, attached, not_applicable'
    },
    // File payload — only set when the document is application-specific.
    file_name: { type: DataTypes.STRING(255) },
    mime_type: { type: DataTypes.STRING(120) },
    file_size_bytes: { type: DataTypes.INTEGER },
    file_data: {
      type: DataTypes.TEXT,
      comment: 'Base64 payload. Same tradeoff as the vault: fine at personal scale, '
        + 'move to object storage before this serves many organizations.'
    },
    financial_document_id: {
      type: DataTypes.UUID,
      references: { model: 'financial_documents', key: 'id' },
      comment: 'Points at a vault document instead of duplicating it — your 990 '
        + 'is the same file for every application that asks for it'
    },
    due_at: {
      type: DataTypes.DATE,
      comment: 'When this piece is needed, if earlier than the application deadline'
    },
    notes: { type: DataTypes.TEXT }
  }, {
    tableName: 'application_documents',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['grant_id'] },
      { fields: ['org_id', 'status'] }
    ]
  });

  ApplicationDocument.associate = (models) => {
    ApplicationDocument.belongsTo(models.Grant, { foreignKey: 'grant_id', as: 'grant' });
    ApplicationDocument.belongsTo(models.FinancialDocument, {
      foreignKey: 'financial_document_id',
      as: 'vaultDocument'
    });
  };

  return ApplicationDocument;
};
