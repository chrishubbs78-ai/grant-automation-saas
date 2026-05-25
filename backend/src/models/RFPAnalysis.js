const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RFPAnalysis = sequelize.define('RFPAnalysis', {
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
    raw_text: {
      type: DataTypes.TEXT,
      comment: 'Original RFP text'
    },
    funder_name: {
      type: DataTypes.STRING(255)
    },
    deadline: {
      type: DataTypes.DATE
    },
    requirements: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Extracted list of requirements'
    },
    page_limit: {
      type: DataTypes.INTEGER
    },
    evaluation_criteria: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'How funder scores applications'
    },
    research_summary: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Gemini research result'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'rfp_analyses',
    timestamps: false
  });

  RFPAnalysis.associate = (models) => {
    RFPAnalysis.belongsTo(models.Grant, { foreignKey: 'grant_id', as: 'grant' });
    RFPAnalysis.belongsTo(models.Organization, { foreignKey: 'org_id', as: 'organization' });
  };

  return RFPAnalysis;
};
