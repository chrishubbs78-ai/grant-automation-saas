# SyncStage infra

## Modal (GPU workers)

One-time setup:

```bash
pip install modal
modal setup                     # authenticates your Modal account

# Create the shared secret used by all workers:
modal secret create syncstage-supabase \
  SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  WORKER_SHARED_SECRET=<same value as in .env>
```

Deploy the workers **from the `workers/` directory** (so
`syncstage_common.py` is importable):

```bash
cd workers
modal deploy analyze/app.py            # T4  — demucs, librosa, crepe, whisperx
modal deploy avatar_sadtalker/app.py   # A10G — photo -> singing avatar
modal deploy avatar_musetalk/app.py    # A10G — video resync (Phase 2)
```

Each deploy prints a `trigger` web endpoint URL — copy them into
`MODAL_ANALYZE_URL` / `MODAL_AVATAR_URL` in your Vercel env.

Model weights are cached in Modal Volumes (`syncstage-model-cache`,
`syncstage-sadtalker-weights`), so only the first invocation pays the
download cost. Keep-warm during active sessions can be added with
`min_containers=1` once usage justifies it (Phase 3 cost controls).

## Supabase

```bash
npm i -g supabase
supabase link --project-ref YOUR_PROJECT_REF
supabase db push        # applies supabase/migrations/*
```

Enable Realtime for `jobs` and `projects` (the migration adds them to the
publication; verify in Dashboard -> Database -> Replication).

## Render worker

Any Node 20 + Chromium + ffmpeg host works. With Docker (build context =
`syncstage/`):

```bash
docker build -f workers/render/Dockerfile -t syncstage-render .
docker run -p 8787:8787 \
  -e SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e WORKER_SHARED_SECRET=... \
  syncstage-render
```

Set `RENDER_WORKER_URL=https://<host>/render` in the app env.

## Vercel (app)

```bash
cd apps/web
vercel link
vercel env add   # all vars from ../../.env.example
vercel deploy --prod
```
