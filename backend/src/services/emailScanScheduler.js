const { Organization } = require('../models');
const { scanForOrg, isConfigured } = require('./emailScanService');
const logger = require('../utils/logger');

/**
 * Daily inbox scan. Opt-in and off by default — it reads your mail and spends
 * Claude tokens, neither of which should start happening because a server
 * restarted.
 */
const INTERVAL_HOURS = parseFloat(process.env.EMAIL_SCAN_INTERVAL_HOURS || '24');
const STARTUP_DELAY_MS = 90 * 1000;

let intervalHandle = null;

async function runScheduledEmailScan() {
  const results = { orgs: 0, findings: 0, errors: [] };

  try {
    const orgs = await Organization.findAll({ attributes: ['id'] });
    for (const org of orgs) {
      try {
        const r = await scanForOrg(org.id);
        results.orgs += 1;
        results.findings += r.created;
      } catch (error) {
        // A mail server hiccup on one org must not stop the rest.
        logger.error({ orgId: org.id, error: error.message }, 'Scheduled inbox scan failed for org');
        results.errors.push({ orgId: org.id, error: error.message });
      }
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Scheduled inbox scan run failed');
    results.errors.push({ error: error.message });
  }

  logger.info(results, 'Scheduled inbox scan complete');
  return results;
}

function startEmailScanScheduler() {
  if (!isConfigured()) {
    logger.info('Daily inbox scan is disabled (set EMAIL_SCAN_ENABLED=true and IMAP credentials to enable)');
    return null;
  }
  if (intervalHandle) return intervalHandle;

  setTimeout(() => {
    runScheduledEmailScan().catch(error => {
      logger.error({ error: error.message }, 'Initial inbox scan failed');
    });
  }, STARTUP_DELAY_MS);

  intervalHandle = setInterval(() => {
    runScheduledEmailScan().catch(error => {
      logger.error({ error: error.message }, 'Inbox scan failed');
    });
  }, INTERVAL_HOURS * 60 * 60 * 1000);

  intervalHandle.unref();

  logger.info({ intervalHours: INTERVAL_HOURS }, 'Daily inbox scan scheduler started');
  return intervalHandle;
}

function stopEmailScanScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { startEmailScanScheduler, stopEmailScanScheduler, runScheduledEmailScan };
