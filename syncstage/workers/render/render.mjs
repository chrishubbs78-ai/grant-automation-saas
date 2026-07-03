/**
 * SyncStage final-render worker: Remotion SSR + FFmpeg mux.
 *
 * Usage:  node render.mjs <job_id>
 * Env:    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (service role — bypasses RLS)
 *
 * Pipeline:
 *   1. Load job -> project -> avatar clips + alignment map + song
 *   2. Bundle the SAME Remotion composition the browser previews
 *   3. Render video-only at the requested preset (16:9 / 9:16 / 1:1)
 *   4. FFmpeg mux: reunite the FULL MIX with the video (roadmap §3.2)
 *   5. Upload to the renders bucket, register final_render asset
 */

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PRESETS = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};
const FPS = 30;

export async function runRenderJob(jobId) {
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const started = Date.now();
  const tmp = mkdtempSync(join(tmpdir(), "syncstage-render-"));

  const progress = (pct, stage, detail = "") =>
    sb.from("jobs").update({ progress: { pct, stage, detail } }).eq("id", jobId).then(() => {});

  try {
    const { data: job, error } = await sb.from("jobs").select("*").eq("id", jobId).single();
    if (error || !job) throw new Error(`Job ${jobId} not found`);
    await sb
      .from("jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId);
    await sb.from("projects").update({ status: "rendering" }).eq("id", job.project_id);

    const preset = PRESETS[job.payload?.preset] ?? PRESETS["16:9"];
    const watermark = job.payload?.watermark ?? true;

    // ---- Gather inputs ----------------------------------------------------
    await progress(5, "download", "fetching assets");
    const { data: assets } = await sb
      .from("assets")
      .select("*")
      .eq("project_id", job.project_id)
      .order("created_at", { ascending: true });

    const song = assets.findLast((a) => a.kind === "song");
    const clips = assets.filter((a) => a.kind === "avatar_clip" && a.range);
    if (!song) throw new Error("No song asset");
    if (clips.length === 0) throw new Error("No avatar clips to render");

    const download = async (asset, name) => {
      const { data, error: dlError } = await sb.storage
        .from(asset.bucket)
        .download(asset.storage_path);
      if (dlError) throw dlError;
      const p = join(tmp, name);
      writeFileSync(p, Buffer.from(await data.arrayBuffer()));
      return p;
    };

    const songPath = await download(song, "song" + extOf(song.storage_path));
    const clipProps = [];
    for (let i = 0; i < clips.length; i++) {
      const p = await download(clips[i], `clip_${i}.mp4`);
      clipProps.push({
        src: p,
        start: clips[i].range.start,
        end: clips[i].range.end,
      });
    }

    const { data: mapRow } = await sb
      .from("alignment_maps")
      .select("data")
      .eq("project_id", job.project_id)
      .maybeSingle();
    const words = (mapRow?.data?.words ?? []).map((w) => ({
      text: w.text,
      start: w.start,
      end: w.end,
      offset: w.offset ?? 0,
    }));

    // ---- Remotion bundle + render (video only) ----------------------------
    await progress(20, "bundle", "bundling composition");
    const entry = resolve(__dirname, "../../apps/web/remotion/index.ts");
    const bundled = await bundle({
      entryPoint: entry,
      webpackOverride: (c) => c,
    });

    const inputProps = { audioSrc: null, clips: clipProps, broll: [], words, watermark };
    const composition = await selectComposition({
      serveUrl: bundled,
      id: "MusicVideo",
      inputProps,
    });

    const videoOnly = join(tmp, "video.mp4");
    await renderMedia({
      composition: {
        ...composition,
        width: preset.width,
        height: preset.height,
        fps: FPS,
      },
      serveUrl: bundled,
      codec: "h264",
      outputLocation: videoOnly,
      inputProps,
      muted: true,
      onProgress: ({ progress: p }) =>
        progress(20 + Math.round(p * 60), "render", `${Math.round(p * 100)}%`),
    });

    // ---- FFmpeg mux with the full mix --------------------------------------
    await progress(85, "mux", "muxing full mix");
    const finalPath = join(tmp, "final.mp4");
    execFileSync("ffmpeg", [
      "-y",
      "-i", videoOnly,
      "-i", songPath,
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "192k",
      "-shortest",
      finalPath,
    ]);

    // ---- Upload -------------------------------------------------------------
    await progress(95, "upload");
    const storagePath = `${job.user_id}/${job.project_id}/final_${Date.now()}.mp4`;
    const { error: upError } = await sb.storage
      .from("renders")
      .upload(storagePath, readFileSync(finalPath), {
        contentType: "video/mp4",
        upsert: true,
      });
    if (upError) throw upError;

    await sb.from("assets").insert({
      project_id: job.project_id,
      user_id: job.user_id,
      kind: "final_render",
      bucket: "renders",
      storage_path: storagePath,
      mime_type: "video/mp4",
      meta: { preset: job.payload?.preset ?? "16:9", watermark },
    });
    await sb.from("projects").update({ status: "done" }).eq("id", job.project_id);
    await sb
      .from("jobs")
      .update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
        progress: { pct: 100, stage: "done" },
        output: { storage_path: storagePath },
      })
      .eq("id", jobId);

    console.log(`✓ Render complete: ${storagePath}`);
  } catch (err) {
    console.error(err);
    await sb
      .from("jobs")
      .update({
        status: "failed",
        error: String(err).slice(0, 2000),
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    throw err;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function extOf(p) {
  const m = /\.[a-zA-Z0-9]+$/.exec(p);
  return m ? m[0] : ".mp3";
}

// CLI entry
const jobId = process.argv[2];
if (jobId) {
  runRenderJob(jobId)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
