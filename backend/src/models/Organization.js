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
    // Contact & legal identity
    ein: {
      type: DataTypes.STRING(20),
      comment: 'Employer Identification Number (EIN / Tax ID)'
    },
    website: {
      type: DataTypes.STRING(255)
    },
    phone: {
      type: DataTypes.STRING(30)
    },
    address: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: '{ street, city, state, zip, country }'
    },
    taxExemptStatus: {
      type: DataTypes.STRING(50),
      defaultValue: '501c3',
      comment: '501c3, 501c4, fiscally_sponsored, other'
    },
    nteeCode: {
      type: DataTypes.STRING(10),
      comment: 'NTEE classification code (e.g. B21 = Charter Schools)'
    },
    // Mission depth
    theoryOfChange: {
      type: DataTypes.TEXT,
      comment: 'How your work creates lasting change (inputs → outputs → outcomes)'
    },
    // Programs
    programsAndServices: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of { name, description, annual_participants, outcomes }'
    },
    geographicScope: {
      type: DataTypes.STRING(50),
      defaultValue: 'local',
      comment: 'local, regional, national, international'
    },
    geographicServiceArea: {
      type: DataTypes.TEXT,
      comment: 'Specific cities, counties, or regions served'
    },
    annualClientsServed: {
      type: DataTypes.INTEGER,
      comment: 'Total individuals served annually across all programs'
    },
    // Evidence & outcomes
    outcomesData: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: '{ metrics: [...], recent_results: [...], data_systems: "..." }'
    },
    evidenceBase: {
      type: DataTypes.TEXT,
      comment: 'Research or evidence that backs your approach'
    },
    // Team & governance
    keyStaff: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of { name, title, bio, years_experience }'
    },
    boardComposition: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: '{ size, expertise_areas, community_representation }'
    },
    // Financial depth
    revenueBreakdown: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: '{ government_pct, foundation_pct, corporate_pct, individual_pct, earned_pct }'
    },
    reservesMonths: {
      type: DataTypes.DECIMAL(4, 1),
      comment: 'Months of operating reserves on hand'
    },
    auditCompleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether an independent audit has been completed'
    },
    // Sustainability & strategy
    sustainabilityPlan: {
      type: DataTypes.TEXT,
      comment: 'How the program continues after grant period ends'
    },
    diversityEquityInclusion: {
      type: DataTypes.TEXT,
      comment: 'DEI statement and practices'
    },
    // Previous grant history
    previousGrantors: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of { funder_name, amount, year, purpose }'
    },
    // Business plan
    businessPlan: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Structured business plan sections: { executive_summary, products_and_programs, market_analysis, marketing_outreach, operations_plan, growth_strategy, financial_projections, funding_strategy, risks_and_mitigation }'
    },
    businessPlanText: {
      type: DataTypes.TEXT,
      comment: 'Full text extracted from an uploaded business plan document'
    },
    businessPlanFileName: {
      type: DataTypes.STRING(255),
      comment: 'Original filename of the uploaded business plan'
    },
    businessPlanUploadedAt: {
      type: DataTypes.DATE,
      comment: 'When the business plan document was last uploaded'
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
    Organization.hasMany(models.FinancialDocument, { foreignKey: 'org_id', as: 'financialDocuments' });
  };

  return Organization;
};
