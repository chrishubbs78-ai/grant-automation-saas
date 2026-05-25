// Jest setup file
// Configure any global test helpers, mocks, or setup here

// Mock dotenv to prevent loading real .env files during tests
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres@localhost:5432/grant_automation';
process.env.JWT_SECRET = 'test-secret-key';
process.env.ANTHROPIC_API_KEY = 'test-api-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.PORT = 4006;
process.env.USE_MOCK_API = 'true';

// Suppress logs during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error and error for debugging
  error: console.error,
};
