const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Grant = sequelize.define('Grant', {
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
    funder_name: {
      type: DataTypes.STRING(255)
    },
    deadline: {
      type: DataTypes.DATE
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      comment: 'Grant amount being requested',
      get() {
        const value = this.getDataValue('amount');
        return value ? parseFloat(value) : value;
      }
    },
    status: {
      type: DataTypes.STRING(50),
      defaultValue: 'draft',
      comment: 'draft, submitted, pending, funded, rejected'
    },
    rfp_analysis: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Parsed RFP requirements'
    },
    draft_sections: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'AI-generated draft sections'
    },
    notes: {
      type: DataTypes.TEXT
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    submitted_at: {
      type: DataTypes.DATE
    },
    outcome_recorded_at: {
      type: DataTypes.DATE
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'grants',
    timestamps: false
  });

  Grant.associate = (models) => {
    Grant.belongsTo(models.Organization, { foreignKey: 'org_id', as: 'organization' });
    Grant.hasOne(models.RFPAnalysis, { foreignKey: 'grant_id', as: 'rfpAnalysis' });
    Grant.hasMany(models.Draft, { foreignKey: 'grant_id', as: 'draftVersions' });
    Grant.hasOne(models.Outcome, { foreignKey: 'grant_id', as: 'outcome' });
  };

  return Grant;
};
