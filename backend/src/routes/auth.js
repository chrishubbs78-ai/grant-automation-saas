const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Simple in-memory user store for MVP (replace with Supabase)
const users = new Map();

// Initialize default user
const DEFAULT_USER_ID = 'owner-private-user';
const DEFAULT_EMAIL = 'owner@private';
const DEFAULT_PASSWORD = 'private-key';

// Ensure default user exists
if (!users.has(DEFAULT_EMAIL)) {
  users.set(DEFAULT_EMAIL, {
    userId: DEFAULT_USER_ID,
    password: DEFAULT_PASSWORD,
    email: DEFAULT_EMAIL
  });
}

router.post('/signup', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password required'
    });
  }

  if (users.has(email)) {
    return res.status(409).json({
      success: false,
      error: 'User already exists'
    });
  }

  const userId = Math.random().toString(36).substr(2, 9);
  users.set(email, { userId, password, email });

  const token = jwt.sign({ userId, email }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });

  res.status(201).json({
    success: true,
    data: {
      token,
      user: { userId, email }
    }
  });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password required'
    });
  }

  const user = users.get(email);
  if (!user || user.password !== password) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }

  const token = jwt.sign({ userId: user.userId, email }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });

  res.json({
    success: true,
    data: {
      token,
      user: { userId: user.userId, email }
    }
  });
});

// Auto-login endpoint for private/personal use
router.get('/default-token', (req, res) => {
  const user = users.get(DEFAULT_EMAIL);
  if (!user) {
    return res.status(500).json({
      success: false,
      error: 'Default user not initialized'
    });
  }

  const token = jwt.sign({ userId: user.userId, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });

  res.json({
    success: true,
    data: {
      token,
      user: { userId: user.userId, email: user.email }
    }
  });
});

// API key status endpoint (no auth required)
router.get('/config/api-keys', (req, res) => {
  const hasClaudeKey = !!process.env.CLAUDE_API_KEY;
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;

  const warnings = [];
  if (!hasClaudeKey) {
    warnings.push('⚠️  Claude API key not configured. RFP parsing and draft generation disabled.');
  }
  if (!hasGeminiKey) {
    warnings.push('⚠️  Gemini API key not configured. Funder research disabled.');
  }

  res.json({
    success: true,
    data: {
      apiKeys: {
        claude: {
          configured: hasClaudeKey,
          required: true,
          purpose: 'RFP parsing and draft generation'
        },
        gemini: {
          configured: hasGeminiKey,
          required: true,
          purpose: 'Funder research and intelligence'
        }
      },
      features: {
        rfpParsing: hasClaudeKey,
        draftGeneration: hasClaudeKey,
        funderResearch: hasGeminiKey,
        analytics: true,
        orgProfile: true
      },
      warnings
    }
  });
});

module.exports = router;
