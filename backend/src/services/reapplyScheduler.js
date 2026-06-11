const { runScheduledReapplyCheck } = require('./reapplyService');
const logger = require('../utils/logger');

const CHECK_INTERVAL_HOURS = parseFloat(process.env.REAPPLY_CHECK_INTERVAL_HOURS || '24');
const STARTUP_DELAY_MS = 30 * 1000;

let intervalHandle = null;

function startReapplyScheduler() {
  if (intervalHandle) return intervalHandle;

  const intervalMs = CHECK_INTERVAL_HOURS * 60 * 60 * 1000;

  // First run shortly after startup so candidates are fresh on boot
  setTimeout(() => {
    runScheduledReapplyCheck().catch(error => {
      logger.error({ error: error.message }, 'Initial reapply check failed');
    });
  }, STARTUP_DELAY_MS);

  intervalHandle = setInterval(() => {
    runScheduledReapplyCheck().catch(error => {
      logger.error({ error: error.message }, 'Reapply check failed');
    });
  }, intervalMs);

  // Don't keep the process alive just for the scheduler
  intervalHandle.unref();

  logger.info({ intervalHours: CHECK_INTERVAL_HOURS }, 'Reapply scheduler started');
  return intervalHandle;
}

function stopReapplyScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  startReapplyScheduler,
  stopReapplyScheduler
};
