# SyncStage go-live checklist (~1–2 hours, mostly waiting on signups)

Copy-paste in order. Everything code-side is already done — these steps only
connect your accounts.

## 1 · Supabase (~15 min)

1. Go to <https://supabase.com/dashboard> → **New project** (free tier is fine
   to start; Pro when you need >1 GB storage).
2. On your machine:

   ```bash
   npm i -g supabase
   cd syncstage
   supabase login
   supabase link --project-ref <YOUR_PROJECT_REF>   # ref is in the dashboard URL
   supabase db push                                  # applies all 3 migrations
   ```

3. Dashboard → **Project Settings → API**: copy the *URL*, *anon key*, and
   *service_role key* — you'll paste them in steps 2 and 4.
4. Dashboard → **Database → Extensions**: enable `pg_cron`, then in the SQL
   editor run:

   ```sql
   select cron.schedule('sweep-stale-jobs', '*/10 * * * *', $$select sweep_stale_jobs()$$);
   ```

## 2 · Modal GPU workers (~20 min + first-run weight downloads)

```bash
pip install modal
modal setup                                # opens browser to create/link account

# Generate the shared worker secret once and keep it:
openssl rand -hex 32                       # -> WORKER_SHARED_SECRET

modal secret create syncstage-supabase \
  SUPABASE_URL=https://<ref>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
  WORKER_SHARED_SECRET=<the hex string>

cd syncstage/workers
modal deploy analyze/app.py                # prints ...analyze-trigger.modal.run
modal deploy avatar_sadtalker/app.py       # prints ...sadtalker-trigger.modal.run
```

Save both printed `trigger` URLs.

> First analyze/avatar runs are slow (model weights download into Modal
> volumes); subsequent runs are fast.

## 3 · Render worker (~15 min)

Any Docker host works — Fly.io shown:

```bash
cd syncstage
docker build -f workers/render/Dockerfile -t syncstage-render .
fly launch --image syncstage-render --name syncstage-render --no-deploy
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... WORKER_SHARED_SECRET=...
fly deploy
# RENDER_WORKER_URL = https://syncstage-render.fly.dev/render
```

(Or skip for now — upload/analyze/generate/edit all work without it; only the
final MP4 export needs it.)

## 4 · Run the app

Local:

```bash
cd syncstage
cp .env.example apps/web/.env.local        # fill in everything from steps 1–3
npm install
npm run build --workspace=packages/shared
npm run dev                                 # http://localhost:3000
```

Vercel (when ready): import the repo, set **Root Directory** to
`syncstage/apps/web`, add the same env vars, deploy.

## 5 · First real test (the roadmap's action #4)

1. Sign in with a magic link → New project.
2. Upload a 3-minute MP3 → watch the analyze job progress live.
3. Upload a clear, front-facing photo → tick consent → **Generate singing avatar**.
4. Open the timeline editor, drag a word, hit **Re-render edited segments**.
5. Send me anything that errors — SadTalker CLI flags and WhisperX pins are
   the most likely first-run friction, and I can fix them from the job's
   error message.
