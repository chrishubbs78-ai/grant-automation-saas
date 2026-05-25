const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Outcome = sequelize.define('Outcome', {
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
    funder_type: {
      type: DataTypes.STRING(50),
      comment: 'foundation, government, corporate, other'
    },
    amount_bracket: {
      type: DataTypes.STRING(50),
      comment: '<$50K, $50K-$100K, $100K-$500K, $500K+'
    },
    funded: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      comment: 'true if funded, false if rejected'
    },
    notes: {
      type: DataTypes.TEXT,
      comment: 'Feedback or notes on outcome'
    },
    submitted_date: {
      type: DataTypes.DATE
    },
    outcome_date: {
      type: DataTypes.DATE,
      comment: 'Date outcome was recorded'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'outcomes',
    timestamps: false
  });

  Outcome.associate = (models) => {
    Outcome.belongsTo(models.Grant, { foreignKey: 'grant_id', as: 'grant' });
    Outcome.belongsTo(models.Organization, { foreignKey: 'org_id', as: 'organization' });
  };

  return Outcome;
};
