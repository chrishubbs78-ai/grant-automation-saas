const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const router = express.Router();

const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || '00000000-0000-0000-0000-000000000001';
const DEFAULT_EMAIL = process.env.DEFAULT_USER_EMAIL || 'owner@private';
const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD || 'private-key';
const SALT_ROUNDS = 10;

// Called from app startup after DB is synced
async function ensureDefaultUser() {
  try {
    const exists = await User.findOne({ where: { email: DEFAULT_EMAIL } });
    if (!exists) {
      const password_hash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
      await User.create({ id: DEFAULT_USER_ID, email: DEFAULT_EMAIL, password_hash });
      console.log('Default user created');
    }
  } catch (err) {
    console.error('Failed to seed default user:', err.message);
  }
}

router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, error: 'User already exists' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ email, password_hash });

    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      success: true,
      data: { token, user: { userId: user.id, email: user.email } }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      data: { token, user: { userId: user.id, email: user.email } }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Auto-login for private/personal use — returns a fresh token for the default account
router.get('/default-token', async (req, res) => {
  try {
    const user = await User.findOne({ where: { email: DEFAULT_EMAIL } });
    if (!user) {
      return res.status(500).json({ success: false, error: 'Default user not initialized' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      data: { token, user: { userId: user.id, email: user.email } }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API key status endpoint (no auth required)
router.get('/config/api-keys', (req, res) => {
  const hasClaudeKey = !!process.env.CLAUDE_API_KEY;
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;

  const warnings = [];
  if (!hasClaudeKey) warnings.push('⚠️  Claude API key not configured. RFP parsing and draft generation disabled.');
  if (!hasGeminiKey) warnings.push('⚠️  Gemini API key not configured. Funder research disabled.');

  res.json({
    success: true,
    data: {
      apiKeys: {
        claude: { configured: hasClaudeKey, required: true, purpose: 'RFP parsing and draft generation' },
        gemini: { configured: hasGeminiKey, required: true, purpose: 'Funder research and intelligence' }
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
module.exports.ensureDefaultUser = ensureDefaultUser;
