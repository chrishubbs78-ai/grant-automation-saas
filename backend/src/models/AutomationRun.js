const { DataTypes } = require('sequelize');

/** One pass of the automation runner, kept so every automatic action is visible. */
module.exports = (sequelize) => {
  const AutomationRun = sequelize.define('AutomationRun', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    org_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'organizations', key: 'id' }
    },
    trigger: { type: DataTypes.STRING(20), defaultValue: 'manual', comment: 'manual or scheduled' },
    status: { type: DataTypes.STRING(20), defaultValue: 'running', comment: 'running, completed, partial (some steps failed), failed' },
    actions: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of { step, outcome, detail, grant_id?, loan_id? }'
    },
    needs_you: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Things only the owner can do: portal submissions, signatures, approvals'
    },
    started_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    finished_at: { type: DataTypes.DATE }
  }, {
    tableName: 'automation_runs',
    timestamps: false
  });

  return AutomationRun;
};
