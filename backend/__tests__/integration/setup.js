const { sequelize } = require('../../src/models');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Use a file-based lock to coordinate setup across Jest worker processes
// Use os.tmpdir() for cross-platform compatibility (Unix /tmp vs Windows TEMP)
const LOCK_FILE = path.join(os.tmpdir(), 'grant-automation-test-setup.lock');
const SETUP_FLAG_FILE = path.join(os.tmpdir(), 'grant-automation-test-setup-done.flag');

async function acquireLock() {
  // Atomic lock acquisition using mkdir (race-safe - only one can succeed)
  const LOCK_DIR = LOCK_FILE.replace('.lock', '.lock-dir');
  let attempts = 0;
  const maxAttempts = 300; // 30 seconds with 100ms waits

  while (attempts < maxAttempts) {
    try {
      // Try to create directory atomically - only one process wins
      fs.mkdirSync(LOCK_DIR, { exclusive: true });
      fs.writeFileSync(LOCK_FILE, `${Date.now()}`);
      return; // Lock acquired
    } catch (e) {
      // Directory already exists (another process has the lock)
      if (e.code === 'EEXIST') {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        continue;
      }
      throw e;
    }
  }

  throw new Error(`Failed to acquire lock after ${maxAttempts * 100}ms`);
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (e) {
    // Ignore errors
  }
  // Also try to remove lock directory
  try {
    const LOCK_DIR = LOCK_FILE.replace('.lock', '.lock-dir');
    if (fs.existsSync(LOCK_DIR)) {
      fs.rmdirSync(LOCK_DIR);
    }
  } catch (e) {
    // Ignore errors
  }
}

function setupAlreadyDone() {
  return fs.existsSync(SETUP_FLAG_FILE);
}

function markSetupDone() {
  fs.writeFileSync(SETUP_FLAG_FILE, `${Date.now()}`);
}

async function setupTestDatabase() {
  // Wait for setup to be done (either by this worker or another)
  const setupDone = await waitForSetupCompletion();

  if (setupDone && setupDone.byAnotherWorker) {
    console.log('Setup already done by another worker, using existing database');
    return;
  }

  // This worker did the setup, so we're ready to proceed
  console.log('Database setup completed');
}

async function waitForSetupCompletion() {
  // Check if setup was already done by another worker
  if (setupAlreadyDone()) {
    return { byAnotherWorker: true };
  }

  // Try to acquire lock to ensure only one worker does setup
  let lockAcquired = false;
  try {
    await acquireLock();
    lockAcquired = true;
  } catch (e) {
    // Another worker has the lock, wait for setup to complete
    console.log('Waiting for another worker to complete setup...');
    return waitForSetupCompletionByOtherWorker();
  }

  try {
    // Double-check setup wasn't done while we were waiting for the lock
    if (setupAlreadyDone()) {
      console.log('Setup already done (detected after acquiring lock)');
      return { byAnotherWorker: true };
    }

    console.log('Performing database setup...');
    await performDatabaseSetup();
    markSetupDone();
    return { byAnotherWorker: false };
  } finally {
    if (lockAcquired) {
      releaseLock();
    }
  }
}

async function waitForSetupCompletionByOtherWorker() {
  const maxAttempts = 300; // 30 seconds with 100ms waits
  let attempts = 0;

  while (attempts < maxAttempts) {
    if (setupAlreadyDone()) {
      console.log('Another worker completed setup, verifying database...');
      // Verify database is actually ready
      try {
        await verifyDatabaseReady();
        console.log('Database verified and ready');
        return { byAnotherWorker: true };
      } catch (e) {
        console.log('Database not yet ready, waiting...');
        // Database not ready yet, keep waiting
      }
    }

    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }

  throw new Error('Timeout waiting for setup to complete by another worker');
}

async function verifyDatabaseReady() {
  // Check if critical tables exist by querying information_schema
  const result = await sequelize.query(
    `SELECT count(*) as table_count FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('organizations', 'grants', 'templates', 'bulk_jobs', 'rfp_analyses')`,
    { type: sequelize.QueryTypes.SELECT }
  );

  const tableCount = parseInt(result[0].table_count, 10);
  const requiredTablesCount = 5;

  if (tableCount < requiredTablesCount) {
    throw new Error(`Database tables not ready: found ${tableCount}/${requiredTablesCount} required tables`);
  }
}

async function performDatabaseSetup() {
  try {
    // Connect as postgres superuser to manage databases
    const adminClient = new Client({
      user: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'postgres'
    });

    await adminClient.connect();

    try {
      // Terminate all connections to grant_automation
      try {
        await adminClient.query(`
          SELECT pg_terminate_backend(pg_stat_activity.pid)
          FROM pg_stat_activity
          WHERE pg_stat_activity.datname = 'grant_automation'
          AND pid <> pg_backend_pid()
        `);
      } catch (e) {
        // Ignore errors terminating connections
      }

      // Drop database if it exists (this drops ALL objects including ENUM types)
      try {
        await adminClient.query(`DROP DATABASE IF EXISTS grant_automation`);
        console.log('Dropped existing grant_automation database');
      } catch (e) {
        console.warn('Warning dropping database:', e.message);
      }

      // Create fresh database
      await adminClient.query(`CREATE DATABASE grant_automation`);
      console.log('Created fresh grant_automation database');

    } finally {
      await adminClient.end();
    }

    // Wait a moment for database creation to propagate
    await new Promise(resolve => setTimeout(resolve, 500));

    // Close any existing connections to force reconnect
    try {
      await sequelize.close();
      console.log('Closed existing database connections');
    } catch (e) {
      console.log('No existing connections to close');
    }

    // Wait for connections to fully close
    await new Promise(resolve => setTimeout(resolve, 200));

    // Authenticate to the fresh database (creates new connection pool)
    console.log('Authenticating to fresh database...');
    await sequelize.authenticate();
    console.log('Connected to grant_automation database');

    // Wait briefly for the database to be fully ready
    console.log('Waiting for database to stabilize...');
    await new Promise(r => setTimeout(r, 200));

    // Now sync models - creates tables in the right dependency order
    // The database is fresh from DROP DATABASE, so force: true should work
    console.log('Starting database sync...');
    await sequelize.sync({ force: true, alter: false });
    console.log('Database models synchronized successfully');

  } catch (error) {
    console.error('Failed to setup test database:', error.message);
    if (error.original) {
      console.error('Original error:', error.original.message);
    }
    throw error;
  }
}

async function cleanupTestDatabase() {
  try {
    await sequelize.close();
  } catch (error) {
    console.error('Failed to close database:', error);
  }
}

module.exports = {
  setupTestDatabase,
  cleanupTestDatabase
};
