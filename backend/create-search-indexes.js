/**
 * Create database indexes for grant search and filtering
 * Run this once: node create-search-indexes.js
 */

require('dotenv').config();
const { sequelize } = require('./src/models');

async function createIndexes() {
  try {
    console.log('Creating search indexes...');

    // Create indexes for grants table
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_grants_org_status ON grants(org_id, status);
    `);
    console.log('✓ Created idx_grants_org_status');

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_grants_org_deadline ON grants(org_id, deadline);
    `);
    console.log('✓ Created idx_grants_org_deadline');

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_grants_org_amount ON grants(org_id, amount);
    `);
    console.log('✓ Created idx_grants_org_amount');

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_grants_org_funder ON grants(org_id, funder_name);
    `);
    console.log('✓ Created idx_grants_org_funder');

    // Add indexes for efficient sorting/filtering combinations
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_grants_org_deadline_amount ON grants(org_id, deadline, amount);
    `);
    console.log('✓ Created idx_grants_org_deadline_amount');

    console.log('\n✅ All search indexes created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating indexes:', error.message);
    process.exit(1);
  }
}

createIndexes();
