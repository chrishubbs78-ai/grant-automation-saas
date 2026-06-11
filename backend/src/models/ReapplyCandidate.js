const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ReapplyCandidate = sequelize.define('ReapplyCandidate', {
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
    grant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'grants', key: 'id' },
      comment: 'Original rejected grant'
    },
    new_grant_id: {
      type: DataTypes.UUID,
      references: { model: 'grants', key: 'id' },
      comment: 'Grant created when reapply is executed'
    },
    funder_name: {
      type: DataTypes.STRING(255)
    },
    status: {
      type: DataTypes.STRING(50),
      defaultValue: 'pending',
      comment: 'pending (waiting for next cycle), eligible (cycle open), reapplied, dismissed'
    },
    next_cycle_date: {
      type: DataTypes.DATE,
      comment: 'Estimated date the next funding cycle opens/closes'
    },
    auto_reapply: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'When true, scheduler auto-executes reapply once eligible'
    },
    rejection_notes: {
      type: DataTypes.TEXT,
      comment: 'Feedback from the rejection outcome, fed back into the improved draft'
    },
    improvement_context: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Previous draft, recommendations, and other learning context'
    },
    last_checked_at: {
      type: DataTypes.DATE,
      comment: 'Last time the scheduler evaluated this candidate'
    },
    reapplied_at: {
      type: DataTypes.DATE
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'reapply_candidates',
    timestamps: false
  });

  ReapplyCandidate.associate = (models) => {
    ReapplyCandidate.belongsTo(models.Organization, { foreignKey: 'org_id', as: 'organization' });
    ReapplyCandidate.belongsTo(models.Grant, { foreignKey: 'grant_id', as: 'originalGrant' });
    ReapplyCandidate.belongsTo(models.Grant, { foreignKey: 'new_grant_id', as: 'newGrant' });
  };

  return ReapplyCandidate;
};
