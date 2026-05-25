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
    problem_statement: {
      type: DataTypes.TEXT,
      comment: 'Problem statement section'
    },
    impact_statement: {
      type: DataTypes.TEXT,
      comment: 'Impact/significance section'
    },
    budget_narrative: {
      type: DataTypes.TEXT,
      comment: 'Budget justification section'
    },
    team_qualifications: {
      type: DataTypes.TEXT,
      comment: 'Team section'
    },
    evaluation_plan: {
      type: DataTypes.TEXT,
      comment: 'Evaluation section'
    },
    full_draft: {
      type: DataTypes.TEXT,
      comment: 'Complete draft if assembled'
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
