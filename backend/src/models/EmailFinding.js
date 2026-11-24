const { DataTypes } = require('sequelize');

/**
 * Something the daily inbox scan noticed about a tracked application.
 *
 * A finding PROPOSES a status change; it never applies one. Classifying
 * "we regret to inform you" correctly most of the time is not good enough when
 * being wrong means an application silently marked rejected that was actually
 * still live — or worse, a real rejection marked funded. The human confirms.
 */
module.exports = (sequelize) => {
  const EmailFinding = sequelize.define('EmailFinding', {
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
    grant_id: {
      type: DataTypes.UUID,
      references: { model: 'grants', key: 'id' },
      comment: 'The application this appears to concern. Null when unmatched.'
    },
    message_uid: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'IMAP UID + mailbox, so a message is never processed twice'
    },
    subject: { type: DataTypes.TEXT },
    from_address: { type: DataTypes.STRING(320) },
    received_at: { type: DataTypes.DATE },
    snippet: {
      type: DataTypes.TEXT,
      comment: 'Short excerpt kept for context. Full bodies are never stored.'
    },
    classification: {
      type: DataTypes.STRING(30),
      defaultValue: 'unclear',
      comment: 'awarded, rejected, information_requested, acknowledgment, '
        + 'deadline_change, unclear'
    },
    confidence: {
      type: DataTypes.STRING(10),
      defaultValue: 'low',
      comment: 'high, medium, low — low-confidence findings are still shown, '
        + 'just never presented as settled'
    },
    reasoning: {
      type: DataTypes.TEXT,
      comment: 'Why it was read this way, so the human can judge the judgement'
    },
    proposed_status: {
      type: DataTypes.STRING(30),
      comment: 'The grant status this would set, if accepted'
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
      comment: 'pending, accepted, dismissed'
    },
    resolved_at: { type: DataTypes.DATE }
  }, {
    tableName: 'email_findings',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['org_id', 'message_uid'] },
      { fields: ['org_id', 'status'] }
    ]
  });

  EmailFinding.associate = (models) => {
    EmailFinding.belongsTo(models.Grant, { foreignKey: 'grant_id', as: 'grant' });
  };

  return EmailFinding;
};
