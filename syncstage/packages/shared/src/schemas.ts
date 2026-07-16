import { z } from "zod";

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export const JobType = z.enum([
  "analyze", // demucs stems + librosa beats + crepe pitch + whisperx words
  "avatar_generate", // full-song SadTalker/MuseTalk generation (chunked)
  "segment_rerender", // re-sync a single edited time range
  "final_render", // Remotion SSR + ffmpeg mux
]);
export type JobType = z.infer<typeof JobType>;

export const JobStatus = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type JobStatus = z.infer<typeof JobStatus>;

/** Per-stage progress reported by workers into jobs.progress (0-100). */
export const JobProgress = z.object({
  pct: z.number().min(0).max(100),
  stage: z.string(), // e.g. "demucs", "whisperx", "sadtalker:chunk 3/8"
  detail: z.string().optional(),
});
export type JobProgress = z.infer<typeof JobProgress>;

export const SegmentRange = z.object({
  /** seconds, inclusive */
  start: z.number().nonnegative(),
  /** seconds, exclusive */
  end: z.number().positive(),
});
export type SegmentRange = z.infer<typeof SegmentRange>;

export const RenderPreset = z.enum(["16:9", "9:16", "1:1"]);
export type RenderPreset = z.infer<typeof RenderPreset>;

export const RENDER_PRESET_DIMENSIONS: Record<
  RenderPreset,
  { width: number; height: number }
> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

/** Payloads are job-type specific; kept in jobs.payload jsonb. */
export const JobPayload = z.object({
  audioAssetId: z.string().uuid().optional(),
  faceAssetId: z.string().uuid().optional(),
  model: z.enum(["sadtalker", "musetalk", "videoretalking"]).optional(),
  range: SegmentRange.optional(),
  preset: RenderPreset.optional(),
  watermark: z.boolean().optional(),
});
export type JobPayload = z.infer<typeof JobPayload>;

export const Job = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  user_id: z.string().uuid(),
  type: JobType,
  status: JobStatus,
  payload: JobPayload.default({}),
  progress: JobProgress.nullable().optional(),
  error: z.string().nullable().optional(),
  output: z.record(z.unknown()).nullable().optional(),
  cost_usd: z.number().nullable().optional(),
  duration_ms: z.number().int().nullable().optional(),
  created_at: z.string(),
  started_at: z.string().nullable().optional(),
  finished_at: z.string().nullable().optional(),
});
export type Job = z.infer<typeof Job>;

// ---------------------------------------------------------------------------
// Projects & assets
// ---------------------------------------------------------------------------

export const AssetKind = z.enum([
  "song", // original full mix upload
  "face_photo", // avatar source photo
  "face_video", // avatar source video (Phase 2)
  "broll", // cutaway clip or still
  "vocal_stem", // demucs output
  "instrumental_stem", // demucs output
  "analysis", // analysis.json
  "avatar_clip", // generated lip-sync clip (full or segment)
  "final_render", // finished MP4
]);
export type AssetKind = z.infer<typeof AssetKind>;

export const Asset = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  user_id: z.string().uuid(),
  kind: AssetKind,
  bucket: z.string(),
  storage_path: z.string(),
  mime_type: z.string().nullable().optional(),
  /** for avatar_clip segments: which time range of the song this covers */
  range: SegmentRange.nullable().optional(),
  meta: z.record(z.unknown()).nullable().optional(),
  created_at: z.string(),
});
export type Asset = z.infer<typeof Asset>;

export const ProjectStatus = z.enum([
  "empty", // just created
  "uploading",
  "analyzing",
  "ready_to_generate",
  "generating",
  "editing",
  "rendering",
  "done",
]);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

export const Project = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  status: ProjectStatus,
  /** duration of the song in seconds, filled after analysis */
  duration: z.number().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Project = z.infer<typeof Project>;

// ---------------------------------------------------------------------------
// Analysis (produced by workers/analyze, stored as analysis.json)
// ---------------------------------------------------------------------------

export const WordTiming = z.object({
  id: z.string(), // stable id, e.g. "w0042"
  text: z.string(),
  /** seconds in song time (from WhisperX alignment on the vocal stem) */
  start: z.number(),
  end: z.number(),
  score: z.number().optional(), // alignment confidence 0-1
});
export type WordTiming = z.infer<typeof WordTiming>;

export const PitchPoint = z.object({
  t: z.number(), // seconds
  f0: z.number(), // Hz, 0 = unvoiced
  conf: z.number(), // CREPE confidence 0-1
});
export type PitchPoint = z.infer<typeof PitchPoint>;

export const AnalysisResult = z.object({
  version: z.literal(1),
  duration: z.number(),
  sample_rate: z.number().int(),
  tempo_bpm: z.number(),
  /** beat times in seconds */
  beats: z.array(z.number()),
  /** downbeat indices into beats[], if estimated */
  downbeats: z.array(z.number().int()).optional(),
  /** decimated pitch curve (~20 Hz) from CREPE on the vocal stem */
  pitch: z.array(PitchPoint),
  words: z.array(WordTiming),
  /** storage paths of the demucs outputs */
  stems: z.object({
    vocal: z.string(),
    instrumental: z.string(),
  }),
});
export type AnalysisResult = z.infer<typeof AnalysisResult>;

// ---------------------------------------------------------------------------
// Alignment map (the editor's core data structure)
// ---------------------------------------------------------------------------

/**
 * A word entry in the alignment map. `start`/`end` are the analysis times;
 * `offset` is the user's manual correction in seconds (applied to both).
 * Effective time = start + offset .. end + offset.
 */
export const AlignedWord = z.object({
  id: z.string(),
  text: z.string(),
  start: z.number(),
  end: z.number(),
  offset: z.number().default(0),
});
export type AlignedWord = z.infer<typeof AlignedWord>;

export const BrollClip = z.object({
  id: z.string(),
  assetId: z.string().uuid(),
  /** timeline position in seconds */
  start: z.number(),
  duration: z.number(),
  /** trim into the source clip, seconds */
  sourceIn: z.number().default(0),
  kenBurns: z.boolean().default(false),
});
export type BrollClip = z.infer<typeof BrollClip>;

export const AlignmentMap = z.object({
  version: z.number().int(),
  project_id: z.string().uuid(),
  words: z.array(AlignedWord),
  broll: z.array(BrollClip).default([]),
  /** ranges edited since last avatar render, pending segment re-render */
  dirtyRanges: z.array(SegmentRange).default([]),
});
export type AlignmentMap = z.infer<typeof AlignmentMap>;

// ---------------------------------------------------------------------------
// Worker webhook contract (Modal worker -> Next.js /api/worker-callback)
// ---------------------------------------------------------------------------

export const WorkerCallback = z.object({
  job_id: z.string().uuid(),
  status: JobStatus.optional(),
  progress: JobProgress.optional(),
  error: z.string().optional(),
  output: z.record(z.unknown()).optional(),
});
export type WorkerCallback = z.infer<typeof WorkerCallback>;

export const STORAGE_BUCKETS = {
  uploads: "uploads",
  stems: "stems",
  clips: "clips",
  renders: "renders",
} as const;
export type StorageBucket =
  (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];
