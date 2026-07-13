# Quick Start — Personal Use

Get the app running on your own machine in about 10 minutes.

## Prerequisites

- **Node.js 18+**
- **PostgreSQL 14+** running locally

## Step 1 — Create the database

```bash
cd backend
node setup-db.js
```

Or manually in `psql`:

```sql
CREATE DATABASE grant_automation;
```

## Step 2 — Configure the backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` — the three lines that matter:

```bash
# Point at your local postgres (add :password after the user if yours needs one)
DATABASE_URL=postgresql://postgres@localhost:5432/grant_automation

# Any long random string
JWT_SECRET=change-me-to-something-long-and-random

# Your Claude API key — this powers RFP parsing, business plan analysis, and draft writing
CLAUDE_API_KEY=sk-ant-...
```

Get a Claude key at https://console.anthropic.com.

**No key yet?** Set `USE_MOCK_API=true` instead — everything works with canned AI responses so you can explore the whole app first.

Optional: `GEMINI_API_KEY` adds funder research to RFP analysis; `REDIS_URL` enables background queuing for bulk jobs (not needed for personal use — without it they just run inline).

## Step 3 — Start it

```bash
# Terminal 1
cd backend
npm install
npm run dev          # → Server running on port 4006

# Terminal 2
cd frontend
npm install
npm run dev          # → http://localhost:5173
```

## Step 4 — Use it

Open **http://localhost:5173**. The app logs you in automatically (single-owner mode — no signup screen).

1. **Complete your organization profile** — the 10-section questionnaire. You can "Save Progress" at any point and come back via the **✏️ Edit Profile & Business Plan** button on the dashboard.
2. **Add your business plan** (section 10) — upload your existing plan as PDF/DOCX/TXT and the AI fills in the structured sections for you; review, edit, save. Every generated proposal draws on it.
3. **Upload an RFP** on the dashboard — paste text or upload the PDF. You get the parsed deadline, award range, requirements, and evaluation criteria.
4. **Generate Draft** — a full 8-section proposal (executive summary through budget narrative) written from your profile, business plan, and the RFP. Export to DOCX when ready.
5. **Record outcomes** as results come in — rejections automatically enter the Reapply Queue, and next-cycle reapplications are drafted with the rejection feedback baked in.

## Running the tests

```bash
cd backend
npm test
```

Requires local postgres. If your postgres needs a password, pass the URL:
`DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/grant_automation npm test`
(Note: the test run drops and recreates the `grant_automation` database — don't run it against a database holding real data. Stop the dev server first.)

## Deploying somewhere (optional)

The frontend reads `VITE_API_URL` from `frontend/.env` (see `frontend/.env.example`) — set it to your deployed backend URL and build with `npm run build`. `render.yaml` / `vercel.json` are included as starting points; see `DEPLOYMENT.md`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Failed to connect to server" in the browser | Backend isn't running on port 4006 — check Terminal 1 |
| `SASL: client password must be a string` | Your postgres needs a password — add it to `DATABASE_URL` |
| Drafts look generic / instant | You're in mock mode — set `CLAUDE_API_KEY` and remove `USE_MOCK_API` |
| Port 5173 busy | `npm run dev -- --port 5174` (add the origin to `ALLOWED_ORIGINS` in backend/.env) |
