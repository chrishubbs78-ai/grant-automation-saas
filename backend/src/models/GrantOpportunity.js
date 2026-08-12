const { DataTypes } = require('sequelize');

/**
 * A funding opportunity discovered in the outside world.
 *
 * Deliberately NOT the same thing as a Grant. A Grant is "we are applying to
 * this"; an Opportunity is "this exists and might fit someone". Opportunities
 * are source-global and shared across organizations — the per-org judgement
 * about whether it fits lives in OpportunityMatch.
 */
module.exports = (sequelize) => {
  const GrantOpportunity = sequelize.define('GrantOpportunity', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    source: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'grants_gov',
      comment: 'grants_gov, manual, rss, foundation_directory'
    },
    source_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: "Opportunity ID within the source system — deduplication key"
    },
    opportunity_number: {
      type: DataTypes.STRING(100),
      comment: 'Public opportunity number, e.g. USDA-NIFA-CFP-010101'
    },
    title: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    agency: {
      type: DataTypes.STRING(255),
      comment: 'Funding agency / foundation name'
    },
    agency_code: {
      type: DataTypes.STRING(100)
    },
    description: {
      type: DataTypes.TEXT,
      comment: 'Full synopsis text — the substance matching runs against'
    },
    open_date: {
      type: DataTypes.DATE
    },
    close_date: {
      type: DataTypes.DATE,
      comment: 'Application deadline. Null means rolling/unspecified.'
    },
    award_floor: {
      type: DataTypes.DECIMAL(14, 2)
    },
    award_ceiling: {
      type: DataTypes.DECIMAL(14, 2)
    },
    total_funding: {
      type: DataTypes.DECIMAL(16, 2)
    },
    expected_awards: {
      type: DataTypes.INTEGER
    },
    cost_sharing_required: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    eligibility_codes: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Source applicant-type codes, e.g. ["12","25"] on Grants.gov'
    },
    eligibility_text: {
      type: DataTypes.TEXT
    },
    category: {
      type: DataTypes.STRING(255),
      comment: 'Funding activity category (education, health, ...)'
    },
    opportunity_status: {
      type: DataTypes.STRING(30),
      defaultValue: 'posted',
      comment: 'posted, forecasted, closed, archived'
    },
    source_url: {
      type: DataTypes.TEXT
    },
    raw: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Unmodified source payload, kept so re-normalization never needs a refetch'
    },
    last_seen_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: 'Updated every discovery run that still returns this opportunity'
    }
  }, {
    tableName: 'grant_opportunities',
    underscored: true,
    timestamps: true,
    indexes: [
      // Deduplication: one row per opportunity per source, so repeated
      // discovery runs upsert rather than pile up duplicates.
      { unique: true, fields: ['source', 'source_id'] },
      { fields: ['close_date'] },
      { fields: ['opportunity_status'] }
    ]
  });

  GrantOpportunity.associate = (models) => {
    GrantOpportunity.hasMany(models.OpportunityMatch, {
      foreignKey: 'opportunity_id',
      as: 'matches'
    });
  };

  return GrantOpportunity;
};
