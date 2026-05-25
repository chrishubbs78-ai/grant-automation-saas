const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL || 'postgresql://localhost/grant_automation', {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'production' ? false : console.log,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

// Import models
const Organization = require('./Organization');
const Grant = require('./Grant');
const RFPAnalysis = require('./RFPAnalysis');
const Draft = require('./Draft');
const Outcome = require('./Outcome');
const Analytics = require('./Analytics');
const Template = require('./Template');
const BulkJob = require('./BulkJob');

// Initialize models
const models = {
  Organization: Organization(sequelize),
  Grant: Grant(sequelize),
  RFPAnalysis: RFPAnalysis(sequelize),
  Draft: Draft(sequelize),
  Outcome: Outcome(sequelize),
  Analytics: Analytics(sequelize),
  Template: Template(sequelize),
  BulkJob: BulkJob(sequelize)
};

// Define associations
Object.values(models).forEach(model => {
  if (model.associate) {
    model.associate(models);
  }
});

module.exports = {
  sequelize,
  ...models
};
