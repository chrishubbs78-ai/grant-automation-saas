const pino = require('pino');

// Create a Pino logger instance
// In test environment, disable logging to reduce noise
const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info')
});

module.exports = logger;
