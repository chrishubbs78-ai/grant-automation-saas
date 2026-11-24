/**
 * Runs the automation pass for every organization that switched it on.
 * Off unless AUTOMATION_ENABLED=true on the server, because each run can
 * spend Claude tokens and act on the connected Google account.
 */
const logger = require('../utils/logger');

const ENABLED = process.env.AUTOMATION_ENABLED === 'true';
const INTERVAL_HOURS = parseFloat(process.env.AUTOMATION_INTERVAL_HOURS || '24');
const STARTUP_DELAY_MS = 2 * 60 * 1000;

let intervalHandle = null;

async function tick() {
  const { runAllEnabled } = require('./automationService');
  const results = await runAllEnabled();
  logger.info({ results }, 'Scheduled automation pass complete');
  return results;
}

function startAutomationScheduler() {
  if (!ENABLED) {
    logger.info('Automation runner is disabled (set AUTOMATION_ENABLED=true to run it on a schedule)');
    return null;
  }
  if (intervalHandle) return intervalHandle;

  setTimeout(() => {
    tick().catch(error => logger.error({ error: error.message }, 'Initial automation pass failed'));
  }, STARTUP_DELAY_MS).unref();

  intervalHandle = setInterval(() => {
    tick().catch(error => logger.error({ error: error.message }, 'Automation pass failed'));
  }, INTERVAL_HOURS * 60 * 60 * 1000);
  intervalHandle.unref();

  logger.info({ intervalHours: INTERVAL_HOURS }, 'Automation scheduler started');
  return intervalHandle;
}

function stopAutomationScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { startAutomationScheduler, stopAutomationScheduler, tick };
