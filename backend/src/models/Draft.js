const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Draft = sequelize.define('Draft', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    grant_id: {
      type: DataTypes.UUID,
      references: { model: 'grants', key: 'id' }
    },
    org_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'organizations', key: 'id' }
    },
    version: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    // Legacy fields kept for backward compatibility
    problem_statement: { type: DataTypes.TEXT },
    impact_statement: { type: DataTypes.TEXT },
    budget_narrative: { type: DataTypes.TEXT },
    // Expert 8-section fields
    executive_summary: { type: DataTypes.TEXT },
    organization_background: { type: DataTypes.TEXT },
    statement_of_need: { type: DataTypes.TEXT },
    goals_and_objectives: { type: DataTypes.TEXT },
    program_design: { type: DataTypes.TEXT },
    evaluation_plan: { type: DataTypes.TEXT },
    sustainability_plan: { type: DataTypes.TEXT },
    improvement_summary: {
      type: DataTypes.TEXT,
      comment: 'AI explanation of what changed vs prior rejected draft (reapply only)'
    },
    full_draft: {
      type: DataTypes.TEXT,
      comment: 'Assembled full proposal text'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'drafts',
    timestamps: false
  });

  Draft.associate = (models) => {
    Draft.belongsTo(models.Grant, { foreignKey: 'grant_id', as: 'grant' });
    Draft.belongsTo(models.Organization, { foreignKey: 'org_id', as: 'organization' });
  };

  return Draft;
};
