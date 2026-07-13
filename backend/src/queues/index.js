const Bull = require('bull');
const logger = require('../utils/logger');

const REDIS_URL = process.env.REDIS_URL;
let bulkQueue = null;

if (REDIS_URL) {
  bulkQueue = new Bull('bulk-operations', REDIS_URL, {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50
    }
  });

  bulkQueue.on('error', (err) => {
    logger.error({ err: err.message }, 'Bull queue error');
  });

  logger.info('Bull queue connected to Redis');
} else {
  logger.warn('REDIS_URL not set — bulk jobs processed synchronously (set REDIS_URL to enable async queue)');
}

module.exports = { bulkQueue };
