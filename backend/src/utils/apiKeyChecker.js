/**
 * API Key Checker Utility
 * Provides consistent checking and error handling for API keys
 */

const API_KEYS = {
  CLAUDE: {
    name: 'CLAUDE_API_KEY',
    service: 'Claude',
    purpose: 'RFP parsing and draft generation',
    docUrl: 'https://console.anthropic.com'
  },
  GEMINI: {
    name: 'GEMINI_API_KEY',
    service: 'Gemini',
    purpose: 'Funder research and intelligence',
    docUrl: 'https://ai.google.dev'
  }
};

/**
 * Check if an API key is configured
 * @param {string} keyType - 'CLAUDE' or 'GEMINI'
 * @returns {boolean}
 */
function isKeyConfigured(keyType) {
  const key = API_KEYS[keyType];
  if (!key) throw new Error(`Unknown API key type: ${keyType}`);
  return !!process.env[key.name];
}

/**
 * Get all API key statuses
 * @returns {Object} Object with status for each API key
 */
function getKeyStatus() {
  return {
    claude: {
      configured: isKeyConfigured('CLAUDE'),
      service: API_KEYS.CLAUDE.service,
      purpose: API_KEYS.CLAUDE.purpose,
      docUrl: API_KEYS.CLAUDE.docUrl
    },
    gemini: {
      configured: isKeyConfigured('GEMINI'),
      service: API_KEYS.GEMINI.service,
      purpose: API_KEYS.GEMINI.purpose,
      docUrl: API_KEYS.GEMINI.docUrl
    }
  };
}

/**
 * Create a user-friendly error message for missing API key
 * @param {string} keyType - 'CLAUDE' or 'GEMINI'
 * @returns {Object} Error object with code and message
 */
function createMissingKeyError(keyType) {
  const key = API_KEYS[keyType];
  if (!key) throw new Error(`Unknown API key type: ${keyType}`);

  const error = new Error(
    `${key.service} API key not configured. ${key.purpose} is unavailable. ` +
    `Get your API key at ${key.docUrl} and add it to your .env file as ${key.name}.`
  );
  error.code = 'API_KEY_MISSING';
  error.service = key.service;
  error.keyType = keyType;
  return error;
}

/**
 * Log all API key statuses to console
 */
function logKeyStatus() {
  const status = getKeyStatus();
  console.log('\n📋 API Key Status:');

  Object.entries(status).forEach(([key, info]) => {
    if (info.configured) {
      console.log(`  ✅ ${info.service} (${info.purpose})`);
    } else {
      console.warn(`  ⚠️  ${info.service} NOT CONFIGURED`);
      console.warn(`      Get key at: ${info.docUrl}`);
    }
  });

  console.log('');
}

module.exports = {
  isKeyConfigured,
  getKeyStatus,
  createMissingKeyError,
  logKeyStatus,
  API_KEYS
};
