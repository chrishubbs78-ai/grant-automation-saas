#!/usr/bin/env node
/**
 * Database setup script
 * This creates the grant_automation database and user if they don't exist
 */

require('dotenv').config();
const { Client } = require('pg');

const ADMIN_USER = 'postgres';
const ADMIN_HOST = 'localhost';
const ADMIN_PORT = 5432;
const DB_USER = 'grant_automation';
const DB_PASSWORD = 'testpass123';
const DB_NAME = 'grant_automation';

async function setupDatabase() {
  // First, connect as postgres superuser to create the database
  const adminClient = new Client({
    user: ADMIN_USER,
    host: ADMIN_HOST,
    port: ADMIN_PORT,
    database: 'postgres' // Connect to default postgres database
  });

  try {
    console.log('📦 Connecting to PostgreSQL as admin...');
    await adminClient.connect();
    console.log('✅ Connected to PostgreSQL');

    // Check if database exists
    const dbCheckResult = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [DB_NAME]
    );

    if (dbCheckResult.rows.length === 0) {
      console.log(`📝 Creating database '${DB_NAME}'...`);
      await adminClient.query(`CREATE DATABASE ${DB_NAME}`);
      console.log(`✅ Database '${DB_NAME}' created`);
    } else {
      console.log(`✅ Database '${DB_NAME}' already exists`);
    }

    // Check if user exists
    const userCheckResult = await adminClient.query(
      `SELECT 1 FROM pg_user WHERE usename = $1`,
      [DB_USER]
    );

    if (userCheckResult.rows.length === 0) {
      console.log(`📝 Creating user '${DB_USER}'...`);
      await adminClient.query(
        `CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}'`
      );
      console.log(`✅ User '${DB_USER}' created`);
    } else {
      console.log(`✅ User '${DB_USER}' already exists`);
    }

    // Grant privileges
    console.log(`📝 Granting privileges to ${DB_USER}...`);
    await adminClient.query(
      `GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER}`
    );
    console.log(`✅ Privileges granted`);

    await adminClient.end();

    console.log('\n✨ Database setup complete!');
    console.log(`\nYou can now start the backend with: npm run dev`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up database:', error.message);
    console.error('\nTroubleshooting tips:');
    console.error('1. Make sure PostgreSQL is running');
    console.error('2. Make sure the postgres user exists and has no password (or password is known)');
    console.error('3. Check that localhost:5432 is accessible');
    process.exit(1);
  }
}

setupDatabase();
