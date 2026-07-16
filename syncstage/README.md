# SyncStage — AI Music Video Studio

Turn a finished song plus a photo (or video) into a complete music video: an
AI avatar sings the track with accurate mouth sync, visuals cut to the beat,
and a four-lane timeline editor gives full manual control over word/mouth
alignment before the final render.

**Core loop:** Upload song + media → automatic audio analysis (vocal
isolation, beats, pitch, word timestamps) → GPU lip-sync generation →
in-browser timeline editing → server-side MP4 render → download.

Built per the [SyncStage Build Roadmap](#) (July 2026, v1.0).

## Stack

| Layer | Choice |
| --- | --- |
| Frontend + preview/render engine | Next.js 14 · Tailwind · Remotion (identical composition in browser and renderer) |
| Auth · DB · queue · storage | Supabase (Postgres jobs table + Realtime progress, private buckets) |
| GPU compute | Modal (serverless, per-second billing, weight caching) |
| Lip-sync models | SadTalker (MVP, photo) · MuseTalk (Phase 2, video) · VideoReTalking (fallback) |
| Audio analysis | Demucs htdemucs · librosa · CREPE (torchcrepe) · WhisperX |
| Assembly | FFmpeg |

## Repository layout

```
syncstage/
  apps/web/                    Next.js 14 (App Router)
    app/project/[id]/editor/   four-lane timeline UI
    remotion/                  compositions shared with the render worker
    components/timeline/       WaveLane, WordLane, PitchLane, BeatLane, VideoLane
  workers/
    syncstage_common.py        shared Supabase helpers for Python workers
    analyze/                   Modal T4: demucs → librosa → crepe → whisperx
    avatar_sadtalker/          Modal A10G: photo → singing head (chunked + segment re-render)
    avatar_musetalk/           Modal A10G: video resync + VideoReTalking fallback (Phase 2)
    render/                    Remotion SSR + ffmpeg mux (Node, Dockerized)
  packages/shared/             zod schemas: AlignmentMap, Project, Job, AnalysisResult
  supabase/migrations/         jobs, projects, assets, alignment_maps + RLS + buckets
  infra/                       Modal/Supabase/render deploy guide
```

## How the pipeline works

1. **Upload** — song goes to the private `uploads` bucket; an `analyze` job row
   is inserted, which Realtime broadcasts and a webhook forwards to Modal.
2. **Analysis** (`workers/analyze`) — Demucs isolates the vocal stem (the
   single biggest sync-quality lever for singing: every open-source lip-sync
   model is trained on speech, and instrumentation confuses their phoneme
   mapping). librosa maps tempo/beats, CREPE traces the pitch curve, WhisperX
   produces word-level timestamps. Everything lands in `analysis.json`.
3. **Avatar generation** (`workers/avatar_sadtalker`) — the song is chunked
   into ~25 s segments and SadTalker animates the photo against the
   *conditioned vocal stem* per chunk. Chunks upload as `avatar_clip` assets
   with their time ranges.
4. **Editing** — the editor renders four synchronized lanes (waveform via
   wavesurfer.js, CREPE pitch curve as SVG, librosa beat grid, video/clips).
   Dragging a word marker writes an offset into the **alignment map** and
   marks a ±1 s padded dirty range. "Re-render edited segments" enqueues
   `segment_rerender` jobs for just those ranges — a 4-second re-sync costs
   pennies and returns in under a minute, so iteration feels interactive.
5. **Final render** (`workers/render`) — the same Remotion composition the
   browser previews is rendered server-side at the chosen preset
   (16:9 / 9:16 / 1:1), then FFmpeg muxes the **full mix** back in.

## Getting started

### 0. Prerequisites

Accounts: [Supabase](https://supabase.com), [Modal](https://modal.com),
[Vercel](https://vercel.com) (optional for local dev). Locally: Node ≥ 18.17,
npm ≥ 9.

### 1. Install & run the app

```bash
cd syncstage
npm install
cp .env.example apps/web/.env.local   # fill in Supabase keys
npm run build --workspace=packages/shared
npm run dev                            # http://localhost:3000
```

### 2. Stand up Supabase

```bash
supabase link --project-ref YOUR_REF
supabase db push
```

### 3. Deploy the GPU workers

See [infra/README.md](infra/README.md). Short version:

```bash
modal secret create syncstage-supabase SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... WORKER_SHARED_SECRET=...
cd workers
modal deploy analyze/app.py
modal deploy avatar_sadtalker/app.py
```

Copy the printed `trigger` URLs into `MODAL_ANALYZE_URL` / `MODAL_AVATAR_URL`.

### 4. Deploy the render worker

```bash
docker build -f workers/render/Dockerfile -t syncstage-render .
# run it anywhere with the three env vars; set RENDER_WORKER_URL in the app
```

## Roadmap status

- [x] **Phase 0 — Foundation**: monorepo, Supabase schema (jobs queue +
  Realtime + buckets + RLS), Modal analyze worker, upload → job → stems loop
- [x] **Phase 1 — MVP**: analysis.json (beats/pitch/words), chunked SadTalker
  worker, Remotion composition with lyric captions, project page
  (upload → generate → watch → download)
- [x] **Phase 2 — Editor (words + clips)**: four-lane timeline, word-marker
  dragging → alignment map → segment re-render jobs; MuseTalk worker
  scaffold with VideoReTalking fallback; Ken Burns for stills
- [ ] Phase 2 remainder: b-roll placement UI, MuseTalk bring-up on pinned
  commits, sync-confidence scoring
- [ ] **Phase 3 — Hardening**: quotas, retries, spot instances, GFPGAN pass
  (flag already wired in the SadTalker worker), observability dashboard
- [ ] **Phase 4 — Monetization**: daVinci-MagiHuman Studio tier, Stripe

## Safety & licensing

- Consent checkbox is required before generation; add face-match +
  watermarking before public launch (roadmap §7).
- SadTalker is Apache 2.0. **Verify MuseTalk's current license before Phase 2
  ships**; VideoReTalking is research-license — fallback only.

## Cost model (planning numbers)

~$0.30–1.00 per finished 3-minute video on the MVP path (Demucs+analysis
$0.02–0.05 · SadTalker $0.15–0.40 · final render $0.05–0.20); segment
re-renders <$0.03. Benchmark during Phase 0–1 and revise.
