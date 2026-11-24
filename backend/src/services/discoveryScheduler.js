const { Organization } = require('../models');
const { runDiscovery } = require('./matchingEngine');
const logger = require('../utils/logger');

/**
 * Periodic opportunity discovery.
 *
 * Opt-in and OFF by default. Discovery spends Claude tokens on every run, and
 * a background job that quietly bills you on a timer is a bad default — enable
 * it deliberately with AUTO_DISCOVERY_ENABLED=true.
 */
const ENABLED = process.env.AUTO_DISCOVERY_ENABLED === 'true';
const INTERVAL_HOURS = parseFloat(process.env.DISCOVERY_INTERVAL_HOURS || '24');
const STARTUP_DELAY_MS = 60 * 1000;

let intervalHandle = null;

async function runScheduledDiscovery() {
  const results = { orgs: 0, discovered: 0, scored: 0, errors: [] };

  try {
    const orgs = await Organization.findAll({ attributes: ['id', 'name'] });

    for (const org of orgs) {
      try {
        const result = await runDiscovery(org.id);
        results.orgs += 1;
        results.discovered += result.discovered;
        results.scored += result.scored;
      } catch (error) {
        // One org's failure must not stop the rest.
        logger.error({ orgId: org.id, error: error.message }, 'Scheduled discovery failed for org');
        results.errors.push({ orgId: org.id, error: error.message });
      }
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Scheduled discovery run failed');
    results.errors.push({ error: error.message });
  }

  logger.info(results, 'Scheduled discovery complete');
  return results;
}

function startDiscoveryScheduler() {
  if (!ENABLED) {
    logger.info('Automatic opportunity discovery is disabled (set AUTO_DISCOVERY_ENABLED=true to enable)');
    return null;
  }
  if (intervalHandle) return intervalHandle;

  const intervalMs = INTERVAL_HOURS * 60 * 60 * 1000;

  setTimeout(() => {
    runScheduledDiscovery().catch(error => {
      logger.error({ error: error.message }, 'Initial discovery run failed');
    });
  }, STARTUP_DELAY_MS);

  intervalHandle = setInterval(() => {
    runScheduledDiscovery().catch(error => {
      logger.error({ error: error.message }, 'Discovery run failed');
    });
  }, intervalMs);

  intervalHandle.unref();

  logger.info({ intervalHours: INTERVAL_HOURS }, 'Opportunity discovery scheduler started');
  return intervalHandle;
}

function stopDiscoveryScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { startDiscoveryScheduler, stopDiscoveryScheduler, runScheduledDiscovery };
