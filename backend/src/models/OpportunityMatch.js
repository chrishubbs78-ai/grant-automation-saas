const { DataTypes } = require('sequelize');

/**
 * One organization's verdict on one opportunity.
 *
 * Separated from GrantOpportunity because the opportunity is objective and
 * shared, while the score is a judgement specific to an org's mission,
 * budget, and eligibility. Rescoring an org never touches opportunity rows.
 */
module.exports = (sequelize) => {
  const OpportunityMatch = sequelize.define('OpportunityMatch', {
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
    opportunity_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'grant_opportunities', key: 'id' }
    },
    fit_score: {
      type: DataTypes.INTEGER,
      comment: '0-100 semantic fit. Null until stage-2 scoring runs.'
    },
    eligibility_verdict: {
      type: DataTypes.STRING(20),
      defaultValue: 'unknown',
      comment: 'eligible, likely_eligible, ineligible, unknown'
    },
    rationale: {
      type: DataTypes.TEXT,
      comment: 'Why this score — shown to the user, never hidden'
    },
    key_alignment: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Specific reasons this org fits'
    },
    concerns: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Gaps or risks worth knowing before applying'
    },
    prefilter_result: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Stage-1 deterministic checks: which passed, which failed, and why'
    },
    local_boost: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Points added for geographic proximity. Stored separately from the '
        + 'model score so the adjustment is always auditable, never hidden in the total.'
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'new',
      comment: 'new, reviewed, dismissed, converted'
    },
    dismissed_reason: {
      type: DataTypes.TEXT
    },
    grant_id: {
      type: DataTypes.UUID,
      references: { model: 'grants', key: 'id' },
      comment: 'Set once the user converts this match into a real application'
    },
    scored_at: {
      type: DataTypes.DATE
    }
  }, {
    tableName: 'opportunity_matches',
    underscored: true,
    timestamps: true,
    indexes: [
      // One verdict per org per opportunity; rescoring updates in place.
      { unique: true, fields: ['org_id', 'opportunity_id'] },
      { fields: ['org_id', 'status'] },
      { fields: ['fit_score'] }
    ]
  });

  OpportunityMatch.associate = (models) => {
    OpportunityMatch.belongsTo(models.GrantOpportunity, {
      foreignKey: 'opportunity_id',
      as: 'opportunity'
    });
    OpportunityMatch.belongsTo(models.Organization, {
      foreignKey: 'org_id',
      as: 'organization'
    });
    OpportunityMatch.belongsTo(models.Grant, {
      foreignKey: 'grant_id',
      as: 'grant'
    });
  };

  return OpportunityMatch;
};
