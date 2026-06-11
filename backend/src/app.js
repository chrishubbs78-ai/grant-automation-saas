require('dotenv').config();
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { sequelize } = require('./models');
const { logKeyStatus } = require('./utils/apiKeyChecker');
const { initIO } = require('./services/socketService');

const app = express();
const httpServer = http.createServer(app);

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin.trim())) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

// Rate limiting — 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Default body parser — small limit for all standard JSON routes.
// File-upload routes (/api/rfp/upload, /api/financials) apply their own larger limit.
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/org', require('./routes/org'));
app.use('/api/grants', require('./routes/grants'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/bulk', require('./routes/bulk'));
app.use('/api/rfp', require('./routes/rfp'));
app.use('/api/draft', require('./routes/drafts'));
app.use('/api/drafts', require('./routes/drafts'));
app.use('/api/outcomes', require('./routes/outcomes'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/reapply', require('./routes/reapply'));
app.use('/api/financials', require('./routes/financials'));
app.use('/api/export', require('./routes/export'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handling
app.use((err, req, res, next) => {
  const logger = require('pino')();
  logger.error({
    error: err.message,
    stack: err.stack,
    endpoint: req.path,
    method: req.method,
    statusCode: err.status || 500
  });

  const isProduction = process.env.NODE_ENV === 'production';
  const errorMessage = isProduction ? 'Internal server error' : err.message;

  res.status(err.status || 500).json({
    success: false,
    error: errorMessage
  });
});

// Database sync and server start
const PORT = process.env.PORT || 4006;

async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    await sequelize.sync({ alter: false });
    console.log('Models synced');

    // Seed default user (persistent auth)
    const { ensureDefaultUser } = require('./routes/auth');
    await ensureDefaultUser();

    // Check for required API keys
    logKeyStatus();

    // Start background auto-reapply checks
    const { startReapplyScheduler } = require('./services/reapplyScheduler');
    startReapplyScheduler();

    // Initialize Socket.IO on the HTTP server
    const io = new Server(httpServer, {
      cors: {
        origin: allowedOrigins,
        credentials: true
      }
    });
    initIO(io);
    console.log('Socket.IO initialized');

    // Initialize Bull worker processors (registers queue handlers)
    require('./workers/bulkWorker');

    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only start server if this is the main module (not imported by tests)
if (require.main === module) {
  startServer();
}

module.exports = app;
