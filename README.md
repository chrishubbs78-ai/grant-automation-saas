# Grant Automation SaaS

A fully automated pipeline for grant research, writing, and execution. Upload an RFP → get AI-generated draft → track submissions → learn from outcomes.

**Status:** Week 1 Foundation Complete
**Tech Stack:** React + Vite (frontend) | Node + Express (backend) | PostgreSQL (database) | Claude + Gemini APIs

---

## Architecture

```
Frontend (React/Vite)      Backend (Express)        Database (PostgreSQL)
  ├─ Login/Signup           ├─ /api/auth             ├─ organizations
  ├─ Questionnaire Form     ├─ /api/org              ├─ grants
  ├─ Grant Dashboard        ├─ /api/grants           ├─ rfp_analyses
  └─ Analytics              ├─ /api/rfp              ├─ drafts
                            ├─ /api/drafts           ├─ outcomes
                            ├─ /api/outcomes         └─ analytics
                            └─ /api/analytics
```

---

## Quick Start

### Backend Setup

```bash
cd backend

# Copy .env template and fill in your keys
cp .env.example .env

# Start server (http://localhost:4006)
npm start

# Or with auto-reload (requires nodemon):
npm install --save-dev nodemon
npm run dev
```

**Required env vars:**
- `JWT_SECRET` — any random string for JWT signing
- `DATABASE_URL` — PostgreSQL connection (local: postgres://user:pass@localhost:5432/grant_automation)
- `CLAUDE_API_KEY` — your Anthropic API key (for Week 3)
- `GEMINI_API_KEY` — Google Gemini API key (for Week 2)

### Frontend Setup

```bash
cd frontend

# Install dependencies (already done)
npm install

# Start dev server (http://localhost:5173)
npm run dev
```

---

## Week 1 Status

✅ **Done:**
- Frontend: React/Vite scaffold, login/signup, questionnaire form, dashboard skeleton
- Backend: Express app, JWT auth, Organization model, org questionnaire endpoint
- Database: PostgreSQL schema (organizations, grants, rfp_analyses, drafts, outcomes, analytics)
- Routes: 7 route files (auth, org, grants, rfp, drafts, outcomes, analytics)

**What's Working:**
- Sign up / Login (with in-memory user store)
- Fill questionnaire → save to org profile
- View basic dashboard

⏳ **Coming Week 2:**
- RFP upload & parsing (Claude)
- Funder research (Gemini)
- Job queue setup (Bull)

⏳ **Coming Week 3:**
- Draft generation with Claude
- Store draft versions

⏳ **Coming Week 4:**
- Outcome recording
- Analytics computation
- Learning engine (rule-based recommendations)

---

## Database Setup (Manual One-Time)

If you don't have PostgreSQL installed:

1. **Install PostgreSQL:**
   - Windows: https://www.postgresql.org/download/windows/
   - macOS: `brew install postgresql`
   - Linux: `sudo apt-get install postgresql postgresql-contrib`

2. **Create database:**
   ```bash
   createdb grant_automation
   ```

3. **Update `.env`:**
   ```
   DATABASE_URL=postgresql://postgres:password@localhost:5432/grant_automation
   ```

4. **Models auto-sync on first server start** (Sequelize `sync()` in app.js)

---

## API Endpoints (Week 1)

### Auth
- `POST /api/auth/signup` — Sign up
- `POST /api/auth/login` — Login

### Organization Profile
- `GET /api/org` — Fetch org profile
- `POST /api/org/questionnaire` — Save questionnaire
- `PUT /api/org` — Partial update

### Grants (Skeleton)
- `GET /api/grants` — List all grants for org
- `POST /api/grants` — Create new grant
- `PUT /api/grants/:id` — Update grant

### Others (Placeholders for Week 2-4)
- `POST /api/rfp/upload` — Upload RFP
- `GET /api/rfp/:jobId` — Get RFP analysis
- `POST /api/drafts/generate` — Generate draft
- `GET /api/drafts/:jobId` — Get draft
- `POST /api/outcomes/:grantId` — Record outcome
- `GET /api/analytics` — Get analytics

---

## Decisions Locked In

**Decision 1: Learning Timeline**
- Phase 1: Collect data (no recommendations yet)
- Phase 2: Activate learning (after 20-30 outcomes)

**Decision 2: API Orchestration**
- Claude (paid): RFP parsing + draft generation
- Gemini (free): Funder research

**Decision 3: Notifications**
- Dashboard-only (no email)

---

## File Structure

```
Grant-Automation-SaaS/
├─ frontend/
│  ├─ src/
│  │  ├─ App.jsx (main app logic)
│  │  ├─ components/
│  │  │  ├─ OrgQuestionnaireForm.jsx
│  │  │  └─ Dashboard.jsx
│  │  ├─ styles/
│  │  │  ├─ questionnaire.css
│  │  │  └─ dashboard.css
│  │  └─ main.jsx (entry point)
│  ├─ package.json
│  └─ vite.config.js
│
├─ backend/
│  ├─ src/
│  │  ├─ app.js (Express app)
│  │  ├─ models/
│  │  │  ├─ index.js
│  │  │  ├─ Organization.js
│  │  │  ├─ Grant.js
│  │  │  ├─ RFPAnalysis.js
│  │  │  ├─ Draft.js
│  │  │  ├─ Outcome.js
│  │  │  └─ Analytics.js
│  │  ├─ routes/
│  │  │  ├─ auth.js
│  │  │  ├─ org.js
│  │  │  ├─ grants.js
│  │  │  ├─ rfp.js
│  │  │  ├─ drafts.js
│  │  │  ├─ outcomes.js
│  │  │  └─ analytics.js
│  │  └─ middleware/
│  │     └─ auth.js (JWT verification)
│  ├─ .env.example
│  ├─ package.json
│  └─ README.md (this file)
│
└─ README.md (project overview)
```

---

## Next Steps

1. **Set up local database** (PostgreSQL)
2. **Start backend** (`npm start` in backend/)
3. **Start frontend** (`npm run dev` in frontend/)
4. **Sign up** and fill questionnaire
5. **Verify dashboard** loads with org profile

Then: Week 2 (RFP parsing + funder research)

---

## Notes

- Auth uses in-memory user store for MVP (replace with Supabase later)
- Database models auto-create on first server start
- CORS enabled for localhost:5173 ↔ localhost:4006
- No email notifications (dashboard-only)

---

**Created:** May 20, 2026
**Week 1 Status:** Foundation Complete
