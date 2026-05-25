# Quick Deploy - 5 Minutes to Production 🚀

Follow these steps in order. Copy-paste commands exactly.

---

## STEP 1: Verify Everything Works Locally

```bash
cd /c/Users/Owner/Grant-Automation-SaaS/backend
npm test
```

**Expected:** All 141 tests pass ✅

---

## STEP 2: Create GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Name: `grant-automation-saas`
3. **IMPORTANT:** Set to **Public** (required for free Render)
4. Click **Create Repository**
5. Copy your repository URL (looks like: `https://github.com/YOUR_USERNAME/grant-automation-saas.git`)

---

## STEP 3: Push Code to GitHub

Replace `YOUR_REPO_URL` with your actual repo URL from Step 2:

```bash
cd /c/Users/Owner/Grant-Automation-SaaS

git remote add origin YOUR_REPO_URL
git branch -M main
git push -u origin main
```

**Example:**
```bash
git remote add origin https://github.com/john-doe/grant-automation-saas.git
git branch -M main
git push -u origin main
```

---

## STEP 4: Set Up Supabase (Database) - 5 min

1. Go to [supabase.com](https://supabase.com)
2. Click **New Project**
   - Organization: Your name
   - Project name: `grant-automation`
   - Password: Generate secure one (save it!)
   - Region: Closest to you
3. Click **Create new project** (wait ~2 min)
4. Go to **Settings** → **Database**
5. Copy **Connection string** (URI) - looks like:
   ```
   postgresql://postgres:PASSWORD@host:5432/postgres
   ```
6. **Save this string** - you'll need it in next step

---

## STEP 5: Deploy Backend (Render) - 5 min

1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Click **New +** → **Web Service**
4. Select your GitHub repository
5. Configure:
   - Name: `grant-automation-api`
   - Environment: Node
   - Build: `npm install`
   - Start: `node backend/src/app.js`
   - Plan: **Free**
6. Click **Create Web Service** (builds automatically)
7. **Environment Variables** → Add these:
   ```
   NODE_ENV = production
   PORT = 4006
   JWT_SECRET = <paste-this: (run in terminal)>
   ```
   
   To generate JWT_SECRET, run in PowerShell:
   ```powershell
   [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Random -SetSeed 0 -Maximum 999999999).ToString().PadRight(32)))
   ```
   Or online: use any secure random string generator

   Then add:
   ```
   DATABASE_URL = <paste-from-Supabase-step-4>
   CLAUDE_API_KEY = <your-Claude-key>
   GEMINI_API_KEY = <your-Gemini-key>
   ALLOWED_ORIGINS = https://grant-automation-saas.vercel.app
   LOG_LEVEL = info
   ```

8. Wait for "Live" status (green)
9. Copy your URL: `https://grant-automation-api.onrender.com`

**Test it:**
```bash
curl https://grant-automation-api.onrender.com/health
# Should return: {"status":"ok"}
```

---

## STEP 6: Deploy Frontend (Vercel) - 2 min

1. Go to [vercel.com](https://vercel.com)
2. Click **Add New** → **Project**
3. Import your GitHub repository (`grant-automation-saas`)
4. Configure:
   - Framework: Vite
   - Root Directory: `./frontend`
5. **Environment Variables** → Add:
   ```
   VITE_API_URL = https://grant-automation-api.onrender.com/api
   ```
6. Click **Deploy**
7. Wait for "Ready" status
8. Copy your URL (e.g., `https://grant-automation-saas.vercel.app`)

---

## STEP 7: Update Backend CORS

Go back to Render:
1. Select `grant-automation-api` service
2. **Environment** → Edit `ALLOWED_ORIGINS`
3. Change to: `https://grant-automation-saas.vercel.app` (your Vercel URL)
4. Click **Save**
5. Service redeploys automatically (~2 min)

---

## STEP 8: Test Everything

Open in browser:
```
https://grant-automation-saas.vercel.app
```

You should see the Grant Automation dashboard loading.

**If it works:** 🎉 **You're in production!**

---

## What You Have Now

| Component | URL | Cost |
|-----------|-----|------|
| **Backend API** | https://grant-automation-api.onrender.com | Free |
| **Frontend** | https://grant-automation-saas.vercel.app | Free |
| **Database** | Supabase | Free |
| **Auto-Deploy** | On every `git push` | Free |

---

## To Use Your App

1. Open: https://grant-automation-saas.vercel.app
2. Fill out the questionnaire
3. Upload an RFP
4. System generates draft proposal

---

## Troubleshooting

**"Cannot connect to API"**
- Backend might still be building (wait 2-3 min)
- Check Render logs for errors
- Verify `DATABASE_URL` is correct in Render

**"Database connection failed"**
- Verify Supabase connection string
- Check credentials are correct
- Try connecting from psql locally first

**"Slow loading"**
- Render free tier might be sleeping
- First request takes 30 seconds (normal)
- Subsequent requests are fast

---

## Next Steps

1. **Add your API keys:**
   - Get CLAUDE_API_KEY: [console.anthropic.com](https://console.anthropic.com)
   - Get GEMINI_API_KEY: [ai.google.dev](https://ai.google.dev)

2. **Make changes locally:**
   ```bash
   git push origin main  # Auto-deploys to production
   ```

3. **Monitor:**
   - Render logs: https://dashboard.render.com
   - Vercel logs: https://vercel.com/dashboard
   - Supabase: https://app.supabase.com

---

## Full Documentation

See [DEPLOY_FREE.md](./DEPLOY_FREE.md) for complete step-by-step guide with troubleshooting.

---

**Questions?** Check DEPLOY_FREE.md for detailed explanations!

✅ **Deployment Complete!** 🚀
