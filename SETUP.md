# Setup Guide - Grant Automation SaaS

Complete guide to installing and configuring the Grant Automation SaaS application.

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 16+ (recommended: 18 LTS or newer)
  - Download from: https://nodejs.org/
  - Verify: `node --version` and `npm --version`

- **PostgreSQL** 12+ 
  - Download from: https://www.postgresql.org/download/
  - Verify: `psql --version`
  - Ensure PostgreSQL service is running

- **Git** (optional, for cloning the repo)
  - Download from: https://git-scm.com/

## Installation Steps

### 1. Clone the Repository

```bash
# Navigate to your projects directory
cd ~/projects

# Clone the repository
git clone <repository-url> Grant-Automation-SaaS
cd Grant-Automation-SaaS
```

Or if you already have the files:
```bash
cd /path/to/Grant-Automation-SaaS
```

### 2. Set Up PostgreSQL Database

The application provides an automated setup script that creates the database and user.

```bash
cd backend
node setup-db.js
```

**What this script does:**
- Connects to PostgreSQL as the `postgres` superuser
- Creates a new database called `grant_automation`
- Creates a new user called `grant_automation` (password: `testpass123`)
- Grants all privileges on the database to the user
- Provides helpful error messages if anything fails

**If the script fails:**

*Error: "psql: command not found" or "ECONNREFUSED localhost:5432"*
```bash
# Make sure PostgreSQL is running:
# - Windows: Start PostgreSQL service via Services app
# - macOS: brew services start postgresql@15
# - Linux: sudo systemctl start postgresql

# Then try again
node setup-db.js
```

*Error: "password authentication failed for user postgres"*
```bash
# PostgreSQL likely needs a password
# Edit the script to add password to connection string, or:

# Connect manually and run these SQL commands:
psql -U postgres -c "CREATE DATABASE grant_automation;"
psql -U postgres -c "CREATE USER grant_automation WITH PASSWORD 'testpass123';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE grant_automation TO grant_automation;"
```

### 3. Install Backend Dependencies

```bash
cd backend
npm install
```

This installs:
- Express.js (web framework)
- Sequelize (database ORM)
- PostgreSQL client
- JWT for authentication
- Anthropic SDK (for Claude API)
- Google Generative AI SDK (for Gemini API)
- And other utilities

### 4. Configure Environment Variables

```bash
# In the backend directory, copy the example config
cp .env.example .env

# Edit the .env file with your settings:
# - DATABASE_URL: PostgreSQL connection string
# - JWT_SECRET: Random secret key
# - PORT: Server port (default 4006)
# - CLAUDE_API_KEY: (optional, leave blank for mock mode)
# - GEMINI_API_KEY: (optional, leave blank for mock mode)
```

**For development (without API keys):**
```
# backend/.env
DATABASE_URL=postgresql://postgres@localhost:5432/grant_automation
JWT_SECRET=dev-secret-key-change-in-production
PORT=4006
NODE_ENV=development
CLAUDE_API_KEY=
GEMINI_API_KEY=
USE_MOCK_API=false
```

**For testing with real APIs:**
```
# Get keys from:
# CLAUDE_API_KEY: https://console.anthropic.com
# GEMINI_API_KEY: https://ai.google.dev

# backend/.env
DATABASE_URL=postgresql://postgres@localhost:5432/grant_automation
JWT_SECRET=dev-secret-key-change-in-production
PORT=4006
NODE_ENV=development
CLAUDE_API_KEY=sk-ant-your-real-key
GEMINI_API_KEY=your-real-gemini-key
USE_MOCK_API=false
```

### 5. Install Frontend Dependencies

```bash
cd frontend
npm install
```

This installs:
- React 18
- Vite (build tool)
- Axios (HTTP client)
- And other utilities

### 6. Start Development Servers

**Terminal 1 - Backend Server:**
```bash
cd backend
npm run dev

# Expected output:
# ✅ Database connected
# ✅ Models synced
# 📋 API Key Status:
#   ⚠️  CLAUDE_API_KEY is not set
#   ⚠️  GEMINI_API_KEY is not set
# Server running on port 4006
```

**Terminal 2 - Frontend Server:**
```bash
cd frontend
npm run dev

# Expected output:
#   VITE v4.x.x  ready in xxx ms
#   ➜  Local:   http://localhost:5173/
#   ➜  press h to show help
```

### 7. Access the Application

Open your browser and go to:
```
http://localhost:5173
```

You should see:
1. Loading spinner briefly
2. Organization questionnaire form (first time setup)
3. Auto-filled default user (no login required)

**What happens on first load:**
- Frontend auto-fetches JWT token from backend
- Checks if organization profile exists
- Shows questionnaire if new user, dashboard if profile exists
- All data is stored in local development database

## Verification Checklist

After setup, verify everything works:

- [ ] `node backend/setup-db.js` runs without errors
- [ ] `npm run dev` in backend shows "Server running on port 4006"
- [ ] `npm run dev` in frontend shows "Local: http://localhost:5173"
- [ ] Browser shows Grant Automation app (loading state brief)
- [ ] App auto-logs you in (no login page)
- [ ] You can fill out the organization questionnaire
- [ ] You can see "Dashboard" or form depending on whether org profile exists
- [ ] `curl http://localhost:4006/health` returns `{"status":"ok"}`

## Troubleshooting

### Common Issues

**"PORT 5173 is already in use" (Frontend)**
```bash
# Kill the process using the port, or use a different port:
npm run dev -- --port 5174

# Then visit: http://localhost:5174
```

**"EADDRINUSE: address already in use :::4006" (Backend)**
```bash
# Kill the process using port 4006:
# Windows: netstat -ano | findstr :4006
# macOS/Linux: lsof -i :4006
# Then kill it: kill -9 <PID>

# Or change PORT in .env to 4007
```

**"Error: connect ECONNREFUSED 127.0.0.1:5432"**
```bash
# PostgreSQL is not running
# Start it:
# - Windows: Start PostgreSQL from Services
# - macOS: brew services start postgresql@15
# - Linux: sudo systemctl start postgresql
```

**"FATAL: database "grant_automation" does not exist"**
```bash
# Run the setup script:
cd backend
node setup-db.js
```

**"Backend won't start - module not found error"**
```bash
# Reinstall dependencies:
rm -rf node_modules package-lock.json
npm install
npm run dev
```

**Frontend shows blank page or error**
```bash
# Clear browser cache and local storage:
# 1. Open DevTools (F12)
# 2. Go to Application tab
# 3. Clear Local Storage for http://localhost:5173
# 4. Refresh page
```

## Development Commands

**Backend:**
```bash
npm run dev        # Start development server with nodemon
npm test           # Run tests
npm run build      # Build for production
```

**Frontend:**
```bash
npm run dev        # Start development server with Vite
npm run build      # Build for production
npm run preview    # Preview production build locally
npm run lint       # Run ESLint
```

## Directory Structure

```
Grant-Automation-SaaS/
├── backend/
│   ├── src/
│   │   ├── models/           # Database models (Sequelize)
│   │   ├── routes/           # API endpoints
│   │   ├── services/         # Business logic
│   │   ├── middleware/       # Auth, error handling
│   │   ├── utils/            # Utilities
│   │   └── app.js            # Express app
│   ├── setup-db.js           # Database setup script
│   ├── .env                  # Environment variables (git ignored)
│   ├── .env.example          # Config template
│   ├── package.json
│   └── node_modules/
│
├── frontend/
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── pages/            # Page components
│   │   ├── utils/            # Utilities
│   │   ├── App.jsx           # Main app component
│   │   ├── App.css
│   │   └── main.jsx          # Entry point
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── node_modules/
│
├── SETUP.md                  # This file
├── DEVELOPMENT.md            # Development guide
├── DEPLOYMENT.md             # Production deployment
└── README.md                 # Project overview
```

## Database Schema

The application automatically creates these tables via Sequelize:

- **organizations** - Organization profiles and settings
- **grants** - Grant tracking (status, deadline, amount, etc.)
- **rfp_analyses** - Parsed RFP documents
- **drafts** - Generated draft sections
- **outcomes** - Grant funding results (for learning)
- **analytics** - Computed metrics and recommendations

All tables are created automatically on first `npm run dev` - no manual migrations needed.

## Next Steps

1. **Get API Keys (Optional):**
   - Claude: https://console.anthropic.com
   - Gemini: https://ai.google.dev
   - Add to `.env` to use real AI features (or use mock mode)

2. **Test the Workflow:**
   - Fill out organization questionnaire
   - Upload a sample RFP or grant announcement
   - See mock (or real) parsing and research
   - View generated draft sections

3. **Read Documentation:**
   - `DEVELOPMENT.md` - Development guide
   - `DEPLOYMENT.md` - Production deployment
   - `API.md` - API endpoint reference

4. **Explore the Code:**
   - `backend/src/app.js` - Express setup
   - `backend/src/routes/` - API endpoints
   - `frontend/src/App.jsx` - React app structure
   - `backend/setup-db.js` - Database initialization

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review logs in the terminal
3. Check that all prerequisites are installed correctly
4. Verify environment variables are set properly

## Further Reading

- [Node.js Documentation](https://nodejs.org/en/docs/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [React Documentation](https://react.dev)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Sequelize Documentation](https://sequelize.org/docs/v6/getting-started/)
# Get from https://console.anthropic.com
CLAUDE_API_KEY=sk-ant-YOUR_ACTUAL_KEY_HERE

# Get from https://ai.google.dev
GEMINI_API_KEY=YOUR_ACTUAL_GEMINI_KEY_HERE

# Change this to a random string for production
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Existing placeholder:
DATABASE_URL=postgresql://grant_automation:your-secure-password@localhost:5432/grant_automation
```

#### 3. **Start Backend Server**

Once DB is configured, run:

```bash
cd backend
npm run dev
```

Expected output:
```
[nodemon] starting `node src/app.js`
Database connected
Models synced
Server running on port 4006
```

#### 4. **Verify Both Servers Running**

- **Frontend:** http://localhost:5173 ✅ (Already running)
- **Backend:** http://localhost:4006/health (check after DB setup)

---

## Full Test Flow

Once both servers are running:

1. **Visit** http://localhost:5173
2. **Sign up** with email/password
3. **Fill questionnaire** (organization profile)
4. **Upload RFP** (drag-drop text or PDF)
   - Claude parses requirements
   - Gemini researches funder
   - Results stored in DB
5. **Generate Draft** (Click button)
   - Claude creates 3 sections
   - Draft displayed in UI
6. **Record Outcome** (Months later)
   - Click "Record Outcome" on submitted grant
   - System learns your patterns
   - Recommendations generated

---

## Troubleshooting

### Backend won't start - "role Owner does not exist"
**Solution:** Create PostgreSQL user and database (see step 1 above)

### Frontend not loading
**Solution:** Check http://localhost:5173 is accessible
```bash
cd frontend && npm run dev
```

### API calls failing 404
**Solution:** Ensure backend is running on port 4006
```bash
cd backend && npm run dev
```

### Missing module errors
**Solution:** Install all dependencies
```bash
cd backend && npm install
cd frontend && npm install
```

### Claude/Gemini API errors
**Solution:** Verify API keys are correct in `backend/.env`
- Claude: https://console.anthropic.com/account/keys
- Gemini: https://ai.google.dev/api

---

## Architecture Summary

```
Backend (Node/Express) - Port 4006
├─ Routes: /api/auth, /api/org, /api/grants, /api/rfp, /api/drafts, /api/outcomes, /api/analytics
├─ Services: claudeService, geminiService, learningEngine
├─ Database: PostgreSQL (6 tables: organizations, grants, rfp_analyses, drafts, outcomes, analytics)
└─ Models: Organization, Grant, RFPAnalysis, Draft, Outcome, Analytics

Frontend (React/Vite) - Port 5173
├─ Components: Dashboard (main), RFPUploader, OrgQuestionnaireForm
├─ Features: RFP upload, draft generation, analytics display, outcome recording
└─ State: Org profile, grants list, analytics, draft sections

Integrations:
├─ Claude API: RFP parsing, draft generation
├─ Gemini API: Funder research
└─ PostgreSQL: Full data persistence
```

---

## API Endpoints Ready to Use

Once backend starts:

```bash
# Health check
curl http://localhost:4006/health

# Authentication
POST /api/auth/signup
POST /api/auth/login

# Organization
GET /api/org
POST /api/org/questionnaire

# Grants
GET /api/grants
POST /api/grants
PUT /api/grants/:id

# RFP Analysis
POST /api/rfp/upload
GET /api/rfp/:jobId

# Draft Generation
POST /api/drafts/generate
GET /api/drafts/:jobId

# Outcomes & Learning
POST /api/outcomes/:grantId
GET /api/outcomes
GET /api/analytics
```

---

## What's Working Right Now

✅ **Week 1-2:** RFP upload → Claude parsing → Gemini research → Database storage
✅ **Week 3:** Draft generation with Claude using org profile + RFP context
✅ **Week 4:** Outcome tracking + Rule-based learning engine + Analytics

**Ready to collect data and generate recommendations once you record funding outcomes!**

---

## Next Steps

1. **Set up PostgreSQL** (follow steps above)
2. **Add API keys** to `backend/.env`
3. **Start backend:** `cd backend && npm run dev`
4. **Test with real grant** (upload RFP, generate draft, record outcome)
5. **After 5-10 outcomes:** Watch learning engine generate recommendations

Good luck! 🚀
