const { DataTypes } = require('sequelize');

/**
 * A small-business loan being pursued for the business (not the sponsored
 * program — loans are borrowed by the for-profit entity and its owner).
 */
module.exports = (sequelize) => {
  const LoanApplication = sequelize.define('LoanApplication', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    org_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'organizations', key: 'id' }
    },
    program_key: {
      type: DataTypes.STRING(60),
      comment: 'Key from the loan program catalog (sba_7a, sba_microloan, ...)'
    },
    lender_name: { type: DataTypes.STRING(255) },
    lender_contact: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: '{ name, email, phone }'
    },
    amount_requested: {
      type: DataTypes.DECIMAL(12, 2),
      get() {
        const v = this.getDataValue('amount_requested');
        return v ? parseFloat(v) : v;
      }
    },
    status: {
      type: DataTypes.STRING(30),
      defaultValue: 'researching',
      comment: 'researching, preparing, submitted, in_underwriting, approved, declined, funded, withdrawn'
    },
    next_step: { type: DataTypes.TEXT },
    next_step_date: { type: DataTypes.DATE },
    loan_package: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'AI-written lender packet sections'
    },
    terms: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: '{ rate, term_months, monthly_payment, fees } once offered'
    },
    google: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: '{ gmail_draft_id, calendar_event_ids[], drive_file_id, drive_link }'
    },
    notes: { type: DataTypes.TEXT },
    submitted_at: { type: DataTypes.DATE },
    decided_at: { type: DataTypes.DATE }
  }, {
    tableName: 'loan_applications',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  LoanApplication.associate = (models) => {
    LoanApplication.belongsTo(models.Organization, { foreignKey: 'org_id', as: 'organization' });
  };

  return LoanApplication;
};
