# Quick Start - Grant Automation SaaS

**Frontend Status:** ✅ Running on http://localhost:5173
**Backend Status:** ⏳ Ready (waiting for database)

---

## TL;DR - 3 Steps to Get Running

### Step 1: Create PostgreSQL Database (5 minutes)

Open PostgreSQL and run:
```sql
CREATE USER grant_automation WITH PASSWORD 'testpass123';
CREATE DATABASE grant_automation OWNER grant_automation;
GRANT ALL PRIVILEGES ON DATABASE grant_automation TO grant_automation;
```

### Step 2: Add API Keys

Edit `backend/.env`:
```
CLAUDE_API_KEY=sk-ant-YOUR_KEY_HERE
GEMINI_API_KEY=YOUR_KEY_HERE
```

Get keys from:
- Claude: https://console.anthropic.com/account/keys
- Gemini: https://ai.google.dev/api

### Step 3: Start Backend

```bash
cd backend
npm run dev
```

Wait for:
```
Database connected
Models synced
Server running on port 4006
```

---

## You're Done! 🎉

Now test:
1. Open http://localhost:5173
2. Sign up with any email/password
3. Fill out the questionnaire
4. Upload an RFP
5. Generate a draft
6. Record grant outcome

---

## Troubleshooting

**Backend won't start?**
- Check PostgreSQL is running
- Verify DATABASE_URL in `backend/.env` is correct
- Check API keys are set

**Frontend not loading?**
- Should be running on http://localhost:5173
- If not, run: `cd frontend && npm run dev`

**API calls failing?**
- Make sure backend is running on port 4006
- Check `backend/.env` has valid API keys

---

## Folder Structure

```
Grant-Automation-SaaS/
├── backend/              # Express server + AI services
│   ├── src/
│   │   ├── app.js        # Main server
│   │   ├── routes/       # API endpoints
│   │   ├── services/     # Claude, Gemini, Learning Engine
│   │   ├── models/       # Database schemas
│   │   └── middleware/   # Auth, error handling
│   ├── .env              # YOUR CONFIG (API keys, DB)
│   └── package.json
│
├── frontend/             # React + Vite
│   ├── src/
│   │   ├── components/   # Dashboard, RFPUploader, Forms
│   │   ├── styles/       # CSS files
│   │   └── App.jsx       # Main app
│   ├── .env.example
│   └── package.json
│
├── SETUP.md              # Detailed setup guide
├── PREREQUISITES_STATUS.md  # What's done/what's left
├── QUICK_START.md        # This file
└── START_DEV_SERVERS.bat # Windows batch file to start both servers
```

---

## What Each Server Does

### Backend (Port 4006)
- Receives RFP uploads
- Calls Claude API to parse RFP
- Calls Gemini API to research funder
- Generates draft sections with Claude
- Records grant outcomes
- Computes analytics & recommendations
- Stores everything in PostgreSQL

### Frontend (Port 5173)
- Displays login/signup forms
- Questionnaire for org profile
- RFP upload with drag-drop
- Draft display
- Analytics dashboard
- Outcome recording modal

---

## Database Schema (Auto-created on startup)

```sql
organizations    -- Your org profile
├── id, user_id, name, mission, team_summary, track_record, financials

grants          -- All grant opportunities tracked
├── id, org_id, funder_name, deadline, amount, status, rfp_analysis

rfp_analyses    -- Parsed RFP requirements
├── id, grant_id, funder_name, requirements, page_limit, evaluation_criteria, research_summary

drafts          -- Generated proposal sections
├── id, grant_id, problem_statement, impact_statement, budget_narrative

outcomes        -- Funding results (what the system learns from)
├── id, grant_id, funded, funder_type, amount_bracket, outcome_date

analytics       -- Computed metrics & recommendations
├── id, org_id, win_rate, win_rate_by_funder_type, recommendations
```

---

## API Endpoints (Testing)

Once backend is running on http://localhost:4006:

```bash
# Health check
curl http://localhost:4006/health

# You'll use these in the app:
POST   /api/auth/signup              # Sign up
POST   /api/auth/login               # Login
GET    /api/org                      # Get org profile
POST   /api/org/questionnaire        # Save org profile
GET    /api/grants                   # List grants
POST   /api/rfp/upload               # Upload RFP
GET    /api/rfp/:jobId               # Check parsing status
POST   /api/drafts/generate          # Generate draft
GET    /api/drafts/:jobId            # Check draft status
POST   /api/outcomes/:grantId        # Record outcome
GET    /api/analytics                # Get recommendations
```

---

## Example Workflow

1. **Sign up:** email: test@example.com, password: test123
2. **Questionnaire:** Fill out org name, mission, team, etc.
3. **Upload RFP:** Paste text of a real grant opportunity (from grants.gov, foundation site, etc.)
4. **Wait:** Claude parses (5-10 sec), Gemini researches funder (5-10 sec)
5. **See results:** Funder name, deadline, requirements displayed
6. **Generate draft:** Click button, Claude creates 3 sections (10-20 sec)
7. **Later:** Mark grant as "submitted"
8. **Record outcome:** Click "Record Outcome", select funded/rejected, save
9. **View analytics:** See win rate, recommendations, success funders

---

## Next Steps After Setup

- [ ] Create PostgreSQL user/database
- [ ] Add API keys to backend/.env
- [ ] Start backend: `cd backend && npm run dev`
- [ ] Verify both servers running
- [ ] Sign up on http://localhost:5173
- [ ] Upload first RFP
- [ ] Generate draft
- [ ] Record first outcome
- [ ] Watch learning engine work!

---

## Need Help?

- **Setup issues?** → See `SETUP.md`
- **What's done/left?** → See `PREREQUISITES_STATUS.md`
- **API reference?** → See code in `backend/src/routes/`
- **Database questions?** → See `backend/src/models/`

---

## Performance Notes

- RFP parsing: 5-10 seconds (Claude API latency)
- Funder research: 5-10 seconds (Gemini API latency)
- Draft generation: 10-20 seconds (Claude API latency)
- Learning engine: Instant (rule-based)

These times depend on API response speeds. Claude/Gemini often respond in 3-5 seconds.

---

**Questions? Check SETUP.md for detailed troubleshooting!**
