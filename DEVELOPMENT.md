# Development Guide - Grant Automation SaaS

This guide covers setting up the development environment and understanding the key features for development and testing.

## Quick Start (With Mock Mode)

The application is designed to work without API keys during development using realistic mock responses.

### 1. Database Setup

```bash
cd backend
node setup-db.js
```

This script will:
- Connect to PostgreSQL as the superuser
- Create the `grant_automation` database
- Create the `grant_automation` user
- Grant necessary permissions

### 2. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend (in another terminal)
cd frontend
npm install
```

### 3. Start Development Servers

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

You should see:
```
✅ Database connected
✅ Models synced

📋 API Key Status:
  ⚠️  CLAUDE_API_KEY is not set
      - Using mock responses for development
  ⚠️  GEMINI_API_KEY is not set
      - Using mock responses for development

Server running on port 4006
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Visit `http://localhost:5173` in your browser. The app will:
1. Auto-login with default credentials
2. Show the organization questionnaire (first time)
3. Allow you to test the full workflow with mock responses

## Understanding Mock Mode

When API keys are not configured, the application uses **realistic mock responses** for development:

### How It Works

**Backend (`src/services/mockApiService.js`)** provides:
- `getMockRFPAnalysis()` - Simulates Claude RFP parsing
- `getMockFunderResearch()` - Simulates Gemini funder research
- `getMockDraft()` - Simulates Claude draft generation

**Services automatically use mock responses:**
- `claudeService.js` - Returns mock data if `CLAUDE_API_KEY` is missing or `USE_MOCK_API=true`
- `geminiService.js` - Returns mock data if `GEMINI_API_KEY` is missing or `USE_MOCK_API=true`

**Log entries show mock mode:**
```
[MOCK] Parsing RFP with mock Claude response...
[MOCK] Researching funder with mock Gemini response...
[MOCK] Generating draft with mock Claude response...
```

### What You Can Test Without API Keys

✅ **Full UI Workflow:**
- Organization profile creation and updates
- RFP upload and parsing (mock)
- Funder research (mock)
- Draft generation (mock)
- Grant tracking and status updates
- Analytics and recommendations

✅ **Database Operations:**
- Org profile storage
- Grant record creation
- RFP analysis storage
- Draft versioning
- Outcome tracking

✅ **Authentication:**
- Auto-login with default user
- JWT token handling
- Protected routes

❌ **Real Capabilities (Require API Keys):**
- Real RFP parsing with Claude
- Real funder intelligence from Gemini
- Real draft customization

## Adding Real API Keys

When you're ready to use real APIs:

### 1. Get API Keys

**Claude API:**
- Go to https://console.anthropic.com
- Generate an API key
- Add to `.env`: `CLAUDE_API_KEY=sk-ant-...`

**Gemini API:**
- Go to https://ai.google.dev
- Create/enable the Generative AI API
- Get API key
- Add to `.env`: `GEMINI_API_KEY=...`

### 2. Update .env File

```bash
# backend/.env

# Real API keys for production-like behavior
CLAUDE_API_KEY=sk-ant-your-real-key-here
GEMINI_API_KEY=your-real-gemini-key-here

# Other config
DATABASE_URL=postgresql://postgres@localhost:5432/grant_automation
JWT_SECRET=your-secret-key
PORT=4006
NODE_ENV=development
```

### 3. Restart Backend

```bash
npm run dev
```

You should now see:
```
📋 API Key Status:
  ✅ CLAUDE_API_KEY is configured
  ✅ GEMINI_API_KEY is configured
```

The system will now make real API calls instead of using mock responses.

## Demo Mode (Optional)

If you want to demonstrate the system without burning API credits, use demo mode:

```bash
# In backend/.env
USE_MOCK_API=true
CLAUDE_API_KEY=sk-ant-your-real-key-here  # Won't be used
GEMINI_API_KEY=...                        # Won't be used
```

With `USE_MOCK_API=true`:
- API keys are ignored (even if configured)
- Mock responses are used for all AI operations
- Perfect for demos, screenshots, training

## File Structure

```
Grant-Automation-SaaS/
├── backend/
│   ├── src/
│   │   ├── services/
│   │   │   ├── claudeService.js       # Claude API + Mock fallback
│   │   │   ├── geminiService.js       # Gemini API + Mock fallback
│   │   │   ├── mockApiService.js      # Mock responses (NEW)
│   │   │   └── ...
│   │   ├── routes/
│   │   │   ├── rfp.js                 # RFP upload/parsing
│   │   │   ├── drafts.js              # Draft generation
│   │   │   └── ...
│   │   ├── utils/
│   │   │   ├── apiKeyChecker.js       # API key status utility (NEW)
│   │   │   └── ...
│   │   └── app.js
│   ├── setup-db.js                    # Database setup script
│   ├── .env.example                   # Config template
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── OrgQuestionnaireForm.jsx
│   │   │   ├── RFPUploader.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   └── ...
│   │   ├── App.jsx                    # Auto-login, view routing
│   │   └── App.css
│   └── package.json
│
└── docs/
    ├── DEVELOPMENT.md                 # This file
    ├── SETUP.md                       # Installation guide
    └── API.md                         # API documentation
```

## Key Development Features

### Auto-Login
The frontend automatically logs in as a default private user on app load:
- No login page required
- Stored in localStorage
- JWT token management handled

### Optimistic UI Updates
The frontend immediately shows "processing..." states while jobs run:
- Polling `/api/rfp/:jobId` and `/api/drafts/:jobId`
- Updates UI when job completes
- Graceful fallback if API unavailable

### In-Memory Job Queue
For MVP, jobs use an in-memory Map instead of Redis:
- Good for development (no additional services)
- Limited to single server instance
- Upgradeable to Bull/Redis for production

### Database Auto-Sync
Sequelize automatically creates tables on startup:
- Models defined in `src/models/`
- Tables created via `sequelize.sync()`
- No manual migrations needed for development

## Debugging

### Check API Key Status

**From terminal:**
```bash
# Backend will log on startup
npm run dev
# Look for "📋 API Key Status:" section
```

**From API:**
```bash
curl http://localhost:4006/api/auth/config/api-keys

# Response shows configured APIs and available features
{
  "apiKeys": {
    "claude": { "configured": false, ... },
    "gemini": { "configured": false, ... }
  },
  "features": {
    "rfpParsing": false,
    "draftGeneration": false,
    "funderResearch": false,
    "analytics": true,
    "orgProfile": true
  },
  "warnings": [...]
}
```

### Check Mock Responses

When using mock mode, logs will show:
```
[MOCK] Parsing RFP with mock Claude response...
[MOCK] Researching funder with mock Gemini response...
[MOCK] Generating draft with mock Claude response...
```

If you see these, you're in mock mode (expected without API keys).

### Common Issues

**"CLAUDE_API_KEY is not set"**
- This is normal during development
- Set `CLAUDE_API_KEY` in `.env` to use real Claude API
- System will use mock responses by default

**"Database connected" fails**
```bash
# Make sure PostgreSQL is running
# Run the setup script
node backend/setup-db.js
```

**Frontend can't connect to backend**
```bash
# Make sure backend is running on port 4006
curl http://localhost:4006/health
# Should return: {"status":"ok"}
```

## Next Steps

1. **Task #1: Error Handling** ✅ Complete - Missing API keys handled gracefully
2. **Task #2: Mock Mode** ✅ Complete - Realistic mock responses for development
3. **Task #3: Documentation** - Create setup + deployment guides
4. **Task #4: Features** - Add search, templates, bulk operations
5. **Task #5: Tests** - Unit and integration tests
6. **Task #6: Review** - Code review and production readiness

## Resources

- [Claude API Documentation](https://docs.anthropic.com)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [Express.js Guide](https://expressjs.com)
- [React Documentation](https://react.dev)
- [Sequelize ORM](https://sequelize.org)
