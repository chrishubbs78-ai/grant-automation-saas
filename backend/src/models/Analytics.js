const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Analytics = sequelize.define('Analytics', {
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
    total_submitted: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    total_funded: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    win_rate: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0,
      comment: 'Percentage of funded vs submitted'
    },
    win_rate_by_funder_type: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Win rates grouped by funder type'
    },
    avg_award_amount: {
      type: DataTypes.DECIMAL(12, 2),
      comment: 'Average amount of funded grants'
    },
    success_funders: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'List of funders who have funded this org'
    },
    recommendations: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Learning engine recommendations'
    },
    computed_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'analytics',
    timestamps: false
  });

  Analytics.associate = (models) => {
    Analytics.belongsTo(models.Organization, { foreignKey: 'org_id', as: 'organization' });
  };

  return Analytics;
};
