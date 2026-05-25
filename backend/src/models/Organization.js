const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Organization = sequelize.define('Organization', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'JWT user ID from auth'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    mission: {
      type: DataTypes.TEXT,
      comment: 'Organization mission statement'
    },
    vision: {
      type: DataTypes.TEXT,
      comment: 'Organization vision statement'
    },
    problemStatement: {
      type: DataTypes.TEXT,
      comment: 'Primary problem the org solves'
    },
    targetPopulation: {
      type: DataTypes.TEXT,
      comment: 'Who the organization serves'
    },
    yearsInOperation: {
      type: DataTypes.INTEGER,
      comment: 'How long the org has been operating'
    },
    teamSummary: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Team leadership info'
    },
    trackRecord: {
      type: DataTypes.TEXT,
      comment: 'Past successes and examples'
    },
    pastGrantsCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of grants won historically'
    },
    annualBudget: {
      type: DataTypes.DECIMAL(12, 2),
      comment: 'Annual organization budget'
    },
    financialStatus: {
      type: DataTypes.STRING(50),
      defaultValue: 'stable',
      comment: 'strong, stable, stressed'
    },
    evaluationCapabilities: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'What metrics the org tracks'
    },
    partnerships: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Key partners and collaborations'
    },
    constraints: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Sector restrictions, geographic scope, etc'
    },
    questionnaire: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Full questionnaire responses'
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'organizations',
    timestamps: true
  });

  Organization.associate = (models) => {
    Organization.hasMany(models.Grant, { foreignKey: 'org_id', as: 'grants' });
    Organization.hasMany(models.RFPAnalysis, { foreignKey: 'org_id', as: 'rfpAnalyses' });
    Organization.hasMany(models.Draft, { foreignKey: 'org_id', as: 'drafts' });
    Organization.hasMany(models.Outcome, { foreignKey: 'org_id', as: 'outcomes' });
    Organization.hasOne(models.Analytics, { foreignKey: 'org_id', as: 'analytics' });
  };

  return Organization;
};
