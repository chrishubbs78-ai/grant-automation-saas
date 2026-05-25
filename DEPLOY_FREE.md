# Deploy to Free Platforms (Vercel + Render + Supabase)

**Total Cost:** $0/month  
**Estimated Setup Time:** 15-20 minutes

---

## Prerequisites

1. **GitHub Account** (free)
2. **Vercel Account** (free) - for frontend
3. **Render Account** (free) - for backend
4. **Supabase Account** (free) - for database
5. **API Keys:**
   - Anthropic Claude (CLAUDE_API_KEY)
   - Google Gemini (GEMINI_API_KEY)

---

## Step 1: Push to GitHub

### 1a. Create a GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Name: `grant-automation-saas`
3. Description: "Grant automation system for researchers"
4. Visibility: **Public** (required for free Render deployment)
5. Click **Create Repository**

### 1b. Push Code to GitHub

```bash
cd /c/Users/Owner/Grant-Automation-SaaS
git remote add origin https://github.com/YOUR_USERNAME/grant-automation-saas.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

---

## Step 2: Deploy Database (Supabase)

### 2a. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click **New Project**
3. Enter project details:
   - Organization: Your name
   - Project name: `grant-automation`
   - Database password: (generate secure password)
   - Region: Closest to you
4. Click **Create new project**
5. Wait for database to initialize (~2 minutes)

### 2b. Get Connection String

1. In Supabase dashboard, go to **Settings** → **Database**
2. Copy the connection string (PostgreSQL URI)
3. Format should be: `postgresql://postgres:PASSWORD@host:5432/postgres`
4. Save this - you'll need it for Render

### 2c. Run Database Migrations

Since Sequelize will auto-sync on first run, the database will be created automatically.

---

## Step 3: Deploy Backend (Render)

### 3a. Create Render Web Service

1. Go to [render.com](https://render.com)
2. Sign up/Log in with GitHub
3. Click **New +** → **Web Service**
4. Select your GitHub repository
5. Fill in details:
   - **Name:** `grant-automation-api`
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node backend/src/app.js`
   - **Plan:** Free

### 3b. Add Environment Variables

In Render dashboard, go to **Environment** and add:

```
NODE_ENV=production
PORT=4006
JWT_SECRET=<generate-secure-string>
DATABASE_URL=<your-supabase-connection-string>
CLAUDE_API_KEY=<your-claude-api-key>
GEMINI_API_KEY=<your-gemini-api-key>
ALLOWED_ORIGINS=https://grant-automation-saas.vercel.app
LOG_LEVEL=info
```

### 3c. Deploy

1. Click **Create Web Service**
2. Render will automatically build and deploy
3. Wait for "Live" status (~2 minutes)
4. Copy your service URL: `https://grant-automation-api.onrender.com`

### Verify Backend

```bash
curl https://grant-automation-api.onrender.com/health
# Should return: {"status":"ok"}
```

---

## Step 4: Deploy Frontend (Vercel)

### 4a. Create Vercel Project

1. Go to [vercel.com](https://vercel.com)
2. Click **Add New** → **Project**
3. Import your GitHub repository
4. Fill in:
   - **Framework Preset:** Vite
   - **Root Directory:** `./frontend`

### 4b. Add Environment Variables

In Vercel dashboard, add:

```
VITE_API_URL=https://grant-automation-api.onrender.com/api
```

### 4c. Deploy

1. Click **Deploy**
2. Vercel will build and deploy
3. Wait for "Ready" status (~1 minute)
4. Your frontend is live at: `https://grant-automation-saas.vercel.app`

### Update Backend CORS

1. Go back to Render dashboard
2. Edit Environment variable:
   - `ALLOWED_ORIGINS` → `https://grant-automation-saas.vercel.app`
3. Click **Save**
4. Service will redeploy automatically (~2 minutes)

---

## Step 5: Verify Everything Works

### Test Health Check
```bash
curl https://grant-automation-api.onrender.com/health
```

### Test Database Connection
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://grant-automation-api.onrender.com/api/org
```

### Visit Frontend
Open: `https://grant-automation-saas.vercel.app`

You should see the Grant Automation SaaS application loaded.

---

## Step 6: Configure and Use

### First Time Setup

1. **Create Org Profile**
   - Go to Dashboard
   - Fill out questionnaire (30-45 minutes)
   - Upload documents

2. **Get API Keys**
   - [Claude API Key](https://console.anthropic.com) - Get from settings
   - [Gemini API Key](https://ai.google.dev) - Create new project, enable API

3. **Upload RFP**
   - Click "Upload RFP"
   - Paste grant opportunity text
   - System researches funder and generates draft

### Monitor in Production

**Render Logs:**
- Dashboard → Service → Logs
- Real-time logs of backend activity

**Vercel Logs:**
- Dashboard → Deployments
- Build logs and runtime errors

---

## Free Tier Limits & Monitoring

### Render (Backend)
- **Compute:** 750 hours/month (about 1 hour/day continuous)
- **If exceeded:** Auto-scales to paid plan
- **Monitoring:** Check logs if responses slow

### Vercel (Frontend)
- **Deployments:** Unlimited
- **Bandwidth:** 100GB/month
- **Functions:** 100,000 calls/month

### Supabase (Database)
- **Storage:** 500MB
- **Bandwidth:** 2GB/month
- **Rows:** Unlimited
- **Connections:** 10 concurrent

---

## Cost Estimation

| Component | Free Tier | Usage | Cost |
|-----------|-----------|-------|------|
| Vercel (Frontend) | 100GB bandwidth | ~10GB/month | $0 |
| Render (Backend) | 750 hrs/month | ~30-100 hrs/month | $0 |
| Supabase (Database) | 500MB storage | ~50MB initial | $0 |
| Claude API | 50K tokens/month | ~5K tokens/month | $0 |
| Gemini API | 15K requests/day | ~100 requests/day | $0 |
| **Total** | | | **$0/month** |

---

## Troubleshooting

### Backend not connecting to frontend
- Check `ALLOWED_ORIGINS` in Render
- Verify Render service is "Live"
- Check browser console for CORS errors

### Database not syncing
- Check `DATABASE_URL` in Render (test with psql)
- Verify Supabase database is active
- Check backend logs for connection errors

### Slow responses
- Render free tier might be sleeping (wakes on first request)
- Check service logs for performance issues
- Consider upgrade if usage exceeds limits

### API key errors
- Verify `CLAUDE_API_KEY` and `GEMINI_API_KEY` are set
- Check they're in `ALLOWED` environment variables (not secrets)
- Test keys are valid at provider dashboards

---

## Next Steps

### For Development
1. Clone repo locally: `git clone <your-repo>`
2. Follow [DEVELOPMENT.md](./DEVELOPMENT.md) for local setup
3. Make changes and push to GitHub
4. Vercel + Render auto-deploy on push

### For Production Use
1. Set up logging aggregation (optional):
   - Datadog (free tier)
   - New Relic (free tier)
   - LogTail (free tier)

2. Monitor usage:
   - Render: Check compute hours
   - Supabase: Check storage & bandwidth
   - Vercel: Check bandwidth usage

3. Scale if needed:
   - Render Starter: $7/month for more compute
   - Supabase Pro: $25/month for more storage
   - Vercel: Paid plan for more bandwidth

---

## Production Checklist

- [ ] Database (Supabase) initialized and reachable
- [ ] Backend (Render) deployed and returning 200 on `/health`
- [ ] Frontend (Vercel) deployed and loads
- [ ] API key environment variables set (all 4)
- [ ] CORS configured for Vercel domain
- [ ] Tested end-to-end: questionnaire → RFP upload → draft generation
- [ ] Verified logs show no errors
- [ ] Created backup of important data

---

## Support & Monitoring

### Monitor These URLs Daily
- Backend: `https://grant-automation-api.onrender.com/health`
- Frontend: `https://grant-automation-saas.vercel.app`
- Database: Supabase dashboard

### Auto-Deploy on Push
- Any push to `main` branch triggers:
  - Render: Auto-rebuilds backend
  - Vercel: Auto-rebuilds frontend
- Deployments usually complete in 1-3 minutes

### Quick Health Check
```bash
# All should return 200 or similar success
curl https://grant-automation-api.onrender.com/health
curl https://grant-automation-saas.vercel.app
```

---

## Summary

✅ **Backend:** Live on Render  
✅ **Frontend:** Live on Vercel  
✅ **Database:** Live on Supabase  
✅ **Cost:** $0/month  
✅ **Auto-deployed on git push**

Your Grant Automation SaaS is now in production! 🚀
