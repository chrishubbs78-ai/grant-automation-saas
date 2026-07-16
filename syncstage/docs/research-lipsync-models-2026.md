# Research: AI-generated singing videos from a photo or your own footage

*July 2026 · Model landscape review for SyncStage ("get the artist" from a
picture or user-supplied video). Updates the roadmap's §2 decisions with
current licenses, pricing, and quality data.*

## TL;DR — what changed since the roadmap was written

| Roadmap decision | Status after research |
| --- | --- |
| SadTalker for MVP photo path | Still fine for bring-up (Apache 2.0, cheapest, best docs), but it's 2023-era quality — known to over-animate/drift. **Benchmark EchoMimicV3 early**; it will likely replace it as default. |
| MuseTalk license "verify before Phase 2" | ✅ **Resolved: MIT, explicit commercial OK.** Caveats: bundled deps (whisper, ft-mse-vae, dwpose, S3FD) have their own licenses; their test data is non-commercial. Phase 2 video path is unblocked. |
| VideoReTalking as dubbing fallback | **Replace with LatentSync** (ByteDance, open source, video-to-video, better identity preservation). VideoReTalking remains research-license; LatentSync removes that liability *and* has a cheap hosted API for burst capacity. |
| daVinci-MagiHuman as Phase 4 premium | Confirmed and better than expected: 15B, Apache 2.0, ~2s to generate a 5s clip on one H100, wins 80% of human evals vs Ovi 1.1, WER 14.6% vs 40.5%. Per-video GPU time may actually be *cheaper* than SadTalker-on-A10G. |

## 1. Photo → singing artist (the MVP path)

### Open source (self-host on Modal)

- **SadTalker** (Apache 2.0) — one photo + audio → talking head with natural
  head motion. Lowest input friction, runs on T4/A10G, best documentation.
  Weaknesses: can over-animate or drift on hard inputs; mouth detail is dated
  next to diffusion-era models. Keep for MVP pipeline bring-up.
- **EchoMimicV3** (Ant Group, AAAI 2026, **1.3B params, Apache 2.0**) —
  unified multi-modal human animation, semi-body (not just the head),
  editable landmark conditioning. Small enough for A10G-class GPUs. **The
  strongest candidate to become SyncStage's default photo model** — schedule
  an A/B against SadTalker in Phase 1.
- **Hallo3** (Fudan, CVPR 2025) — video-diffusion-transformer portrait
  animation, more dynamic backgrounds/motion than SadTalker. English-audio
  focused; license needs a repo check before adoption.
- **daVinci-MagiHuman** (15B, Apache 2.0) — top human-eval quality, 5s clip
  in ~2s on a single H100; single-stream transformer that generates video+
  audio in one pass; 6 languages. Napkin math: a 3-min song ≈ 36 five-second
  clips ≈ ~72s of H100 compute ≈ **$0.06–0.10 GPU cost** at ~$3–4/hr — the
  "premium" tier may be cheaper per video than the MVP tier. Risks: H100
  availability/cold-start, 15B weight download, and we must verify its
  audio-*conditioned* (drive with our vocal stem) mode vs audio-*generating*
  mode.

### Hosted APIs (no GPU infra; per-second pricing)

- **OmniHuman 1.5** (ByteDance, via fal/ModelsLab, **$0.14–0.16/s of output**) —
  explicitly supports singing; generates emotion-aware gestures, full-body
  motion, camera moves from one photo + audio. 720p up to 60s, 1080p up to
  30s. A full 3-min song ≈ **$26–29** — too dear for the base product, but
  compelling as a "performance mode" for short-form 9:16 cuts (15–60s ≈
  $2.40–9.60) or a paid tier. Weights not open.
- **Kling AI Avatar 2.0** — up to 5-minute avatar videos from a single photo;
  vendor evals claim it beats OmniHuman-1.5 and HeyGen on motion/lip-sync/
  realism. API via PiAPI/Kie.ai. Worth a bake-off if we go hosted.
- **Hedra Character-3 / Omnia** — consumer-priced ($15–30/mo, ~15×1-min
  720p videos on the $30 Creator plan); great for prototyping quality
  expectations, not an embeddable per-second API economy.

## 2. Your own video → resynced singing (Phase 2 path)

- **MuseTalk** (Tencent TME, **MIT**) — modifies only the mouth region of
  existing footage; real-time-class (30fps+ on GPU); highest-rated open
  video-to-video option in 2026 roundups. License verified: code MIT, models
  usable commercially; comply with sub-dependency licenses (whisper,
  ft-mse-vae, dwpose, S3FD) and don't ship their test data.
- **LatentSync** (ByteDance, open source; also hosted on fal/WaveSpeed at
  **~$0.20 per 40s, $0.005/s after**) — end-to-end audio-conditioned latent
  diffusion with SyncNet supervision; noted for clarity + identity
  preservation; handles real-life and anime footage. A 3-min resync ≈
  **~$0.90 hosted** — roughly our self-hosted cost, with zero infra. Use as
  (a) the new fallback when MuseTalk's confidence check fails, and (b) a
  burst/overflow path before we scale Modal workers.
- **sync.so** — polished commercial lipsync/dubbing API (free tier; $5–249/mo
  plans + per-second usage). Benchmark reference and emergency fallback.
- **VideoReTalking** — still research-license. Demote from "fallback" to
  "not shipped"; LatentSync covers its niche with a clean license.

## 3. Singing-specific findings (validates the pipeline design)

- **Vocal-stem-first is confirmed as the #1 quality lever.** Multiple 2026
  sources: engines degrade as SNR drops; a clean solo vocal stem is the best
  input you can give any lip-sync model. Our Demucs → high-pass → light
  compression conditioning chain is the right architecture.
- **Sustained vowels partially mask sync errors** — ballads with long notes
  and expressive delivery read as convincing; pop/R&B with clear vocal
  production is the sweet spot. Fast rap and dense mixes are the hard cases —
  exactly where the manual word-marker editor earns its keep.
- **Aggressive autotune/pitch-correction hurts accuracy** (metallic F0
  contours confuse phoneme mapping). Product implication: detect heavy pitch
  correction in analysis and surface a "sync may need manual editing" hint.
- Word-level accuracy of modern engines is ~85–95% on good input — meaning
  every song will still have a few words to fix by hand. The segment
  re-render editor is not a nice-to-have; it's the product.

## 4. Cost per 3-minute finished video (updated)

| Path | Est. cost | Notes |
| --- | --- | --- |
| SadTalker on Modal A10G (MVP) | $0.30–1.00 | roadmap estimate stands |
| EchoMimicV3 on Modal A10G | ~same, TBD | 1.3B — benchmark in Phase 1 |
| MuseTalk video resync (self-host) | $0.10–0.35 | license now clear |
| LatentSync hosted (fal) | ~$0.90 | zero infra; good burst path |
| MagiHuman on H100 (Studio tier) | ~$0.10–0.30 GPU + overhead | verify audio-conditioned mode |
| OmniHuman 1.5 hosted | $26–29 full song / $2.40–9.60 short-form | premium "performance mode" only |

## 5. Recommended actions

1. **Phase 1**: bring up SadTalker as planned; in parallel, run the same
   photo + vocal stem through EchoMimicV3 and Hallo3 on Modal. Pick the
   default on quality-per-dollar; the worker interface already abstracts this.
2. **Phase 2**: proceed with MuseTalk (license cleared). Swap the fallback
   from VideoReTalking to LatentSync; wire fal's hosted LatentSync behind the
   same job type for overflow.
3. **Phase 4**: prototype MagiHuman on Modal H100 early — if its
   audio-conditioned mode works with our stems, it may become the *default*,
   not the premium tier, given the per-video math.
4. Add to analysis worker: SNR estimate on the vocal stem + heavy-autotune
   heuristic, surfaced as sync-quality expectations in the UI.
5. Optional product experiment: "Performance mode" short-form export via
   OmniHuman 1.5 API (gestures + emotion) for 15–60s vertical clips.

## Sources

- [Pixazo — 8 Best Open Source Lip-Sync Models 2026](https://www.pixazo.ai/blog/best-open-source-lip-sync-models)
- [lipsync.com — 5 Best Open-Source Lip Sync Tools (2026)](https://lipsync.com/blog/open-source-lip-sync)
- [MuseTalk GitHub (license & capabilities)](https://github.com/TMElyralab/MuseTalk)
- [Communeify — MuseTalk deep dive](https://www.communeify.com/en/blog/musetalk-tencent-real-time-ai-lip-sync/)
- [LatentSync paper (arXiv 2412.09262)](https://arxiv.org/pdf/2412.09262)
- [fal — LatentSync video-to-video API & pricing](https://fal.ai/models/fal-ai/latentsync)
- [sync.so pricing](https://sync.so/pricing)
- [WaveSpeed — daVinci-MagiHuman announcement](https://wavespeed.ai/blog/posts/davinci-magihuman-open-source-digital-human-lip-sync-2026/)
- [Neurohive — MagiHuman: 5s lip-sync video in 2s on one H100](https://neurohive.io/en/state-of-the-art/davinci-magihuman-open-15b-model-generates-a-5-second-lip-sync-video-in-2-seconds-on-a-single-h100/)
- [fal — OmniHuman 1.5 API & pricing](https://fal.ai/models/fal-ai/bytedance/omnihuman/v1.5)
- [vidmuse — OmniHuman 1.5 explained](https://vidmuse.ai/blog/omnihuman)
- [Kie.ai — Kling AI Avatar 2.0](https://kie.ai/kling-ai-avatar)
- [Hedra — AI talking avatar](https://www.hedra.com/uses/ai-talking-avatar) · [Magic Hour — Hedra guide & pricing](https://magichour.ai/blog/guide-to-hedra-ai)
- [EchoMimicV3 GitHub (Apache 2.0, 1.3B)](https://github.com/antgroup/echomimic_v3)
- [Hallo3 GitHub (CVPR 2025)](https://github.com/fudan-generative-vision/hallo3)
- [Soundverse — AI lip-sync for music videos 2026](https://www.soundverse.ai/blog/article/ai-lip-sync-for-music-videos)
- [Vibemv — turning a song into a lip-sync music video](https://vibemv.app/blog/turn-song-into-lip-sync-music-video)
