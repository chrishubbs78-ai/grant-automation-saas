"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadAsset, signedUrl } from "@/lib/storage";
import { enqueueJob } from "@/lib/jobs";

// Row shapes as they come back from supabase-js (jsonb fields untyped).
type ProjectRow = {
  id: string;
  title: string;
  status: string;
  duration: number | null;
};
type AssetRow = {
  id: string;
  kind: string;
  bucket: string;
  storage_path: string;
  created_at: string;
};
type JobRow = {
  id: string;
  type: string;
  status: string;
  progress: { pct: number; stage: string; detail?: string } | null;
  error: string | null;
  created_at: string;
};

export function ProjectClient({
  project,
  initialAssets,
  initialJobs,
}: {
  project: ProjectRow;
  initialAssets: AssetRow[];
  initialJobs: JobRow[];
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [jobs, setJobs] = useState(initialJobs);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  // Live job + asset updates over Supabase Realtime.
  useEffect(() => {
    const channel = supabase
      .channel(`project-${project.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jobs",
          filter: `project_id=eq.${project.id}`,
        },
        (payload) => {
          const row = payload.new as JobRow;
          setJobs((prev) => {
            const idx = prev.findIndex((j) => j.id === row.id);
            if (idx === -1) return [row, ...prev];
            const next = [...prev];
            next[idx] = row;
            return next;
          });
          // Refresh assets when a job finishes (workers register outputs).
          if (row.status === "succeeded") refreshAssets();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const refreshAssets = useCallback(async () => {
    const { data } = await supabase
      .from("assets")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false });
    if (data) setAssets(data);
  }, [supabase, project.id]);

  const song = assets.find((a) => a.kind === "song");
  const face = assets.find(
    (a) => a.kind === "face_photo" || a.kind === "face_video"
  );
  const analysis = assets.find((a) => a.kind === "analysis");
  const avatarClips = assets.filter((a) => a.kind === "avatar_clip");
  const finalRender = assets.find((a) => a.kind === "final_render");

  const activeJob = jobs.find(
    (j) => j.status === "queued" || j.status === "running"
  );

  async function handleUpload(kind: "song" | "face_photo" | "face_video", file: File) {
    setUploading(kind);
    setError(null);
    try {
      await uploadAsset({ projectId: project.id, file, kind });
      await refreshAssets();
      // Song upload immediately kicks off analysis (Phase 0/1 loop).
      if (kind === "song") {
        await enqueueJob(project.id, "analyze");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(null);
    }
  }

  async function generateAvatar() {
    setError(null);
    try {
      await enqueueJob(project.id, "avatar_generate", {
        model: face?.kind === "face_video" ? "musetalk" : "sadtalker",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function renderFinal() {
    setError(null);
    try {
      await enqueueJob(project.id, "final_render", { preset: "16:9" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function download(asset: AssetRow) {
    const url = await signedUrl(asset.bucket, asset.storage_path);
    window.open(url, "_blank");
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Projects
          </Link>
          <h1 className="text-2xl font-semibold text-white">{project.title}</h1>
        </div>
        {analysis && avatarClips.length > 0 && (
          <Link href={`/project/${project.id}/editor`} className="btn-secondary">
            Open timeline editor
          </Link>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Step 1: song */}
        <section className="card">
          <h2 className="mb-2 font-semibold text-white">1 · Song</h2>
          {song ? (
            <p className="text-sm text-emerald-400">
              ✓ {song.storage_path.split("/").pop()}
            </p>
          ) : (
            <UploadButton
              accept="audio/*"
              label={uploading === "song" ? "Uploading…" : "Upload MP3/WAV"}
              disabled={uploading !== null}
              onFile={(f) => handleUpload("song", f)}
            />
          )}
          {analysis && (
            <p className="mt-2 text-xs text-zinc-400">
              Analysis complete: stems, beats, pitch, word timestamps ready.
            </p>
          )}
        </section>

        {/* Step 2: face */}
        <section className="card">
          <h2 className="mb-2 font-semibold text-white">2 · Face</h2>
          {face ? (
            <p className="text-sm text-emerald-400">
              ✓ {face.storage_path.split("/").pop()}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <UploadButton
                accept="image/*"
                label={uploading === "face_photo" ? "Uploading…" : "Upload photo"}
                disabled={uploading !== null}
                onFile={(f) => handleUpload("face_photo", f)}
              />
              <UploadButton
                accept="video/*"
                label={uploading === "face_video" ? "Uploading…" : "Upload video (Phase 2)"}
                disabled={uploading !== null}
                onFile={(f) => handleUpload("face_video", f)}
              />
            </div>
          )}
          <label className="mt-3 flex items-start gap-2 text-xs text-zinc-400">
            <input type="checkbox" required className="mt-0.5" />
            I confirm I have the right to use this face and consent to AI
            animation of it.
          </label>
        </section>

        {/* Step 3: generate */}
        <section className="card">
          <h2 className="mb-2 font-semibold text-white">3 · Generate avatar</h2>
          {avatarClips.length > 0 ? (
            <p className="text-sm text-emerald-400">
              ✓ {avatarClips.length} clip{avatarClips.length > 1 ? "s" : ""} generated
            </p>
          ) : (
            <button
              className="btn-primary"
              disabled={!song || !face || !analysis || !!activeJob}
              onClick={generateAvatar}
            >
              Generate singing avatar
            </button>
          )}
          {!analysis && song && (
            <p className="mt-2 text-xs text-zinc-500">Waiting for analysis…</p>
          )}
        </section>

        {/* Step 4: render */}
        <section className="card">
          <h2 className="mb-2 font-semibold text-white">4 · Final render</h2>
          {finalRender ? (
            <button className="btn-primary" onClick={() => download(finalRender)}>
              Download MP4
            </button>
          ) : (
            <button
              className="btn-secondary"
              disabled={avatarClips.length === 0 || !!activeJob}
              onClick={renderFinal}
            >
              Render 1080p MP4
            </button>
          )}
        </section>
      </div>

      {/* Job progress */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Jobs
        </h2>
        <div className="space-y-2">
          {jobs.length === 0 && (
            <p className="text-sm text-zinc-500">No jobs yet.</p>
          )}
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      </section>
    </main>
  );
}

function UploadButton({
  accept,
  label,
  disabled,
  onFile,
}: {
  accept: string;
  label: string;
  disabled?: boolean;
  onFile: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <button
        className="btn-secondary"
        disabled={disabled}
        onClick={() => ref.current?.click()}
      >
        {label}
      </button>
    </>
  );
}

function JobCard({ job }: { job: JobRow }) {
  const pct = job.progress?.pct ?? (job.status === "succeeded" ? 100 : 0);
  const color =
    job.status === "failed"
      ? "bg-red-500"
      : job.status === "succeeded"
        ? "bg-emerald-500"
        : "bg-stage-accent";
  return (
    <div className="card !p-3">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-white">
          {job.type.replace(/_/g, " ")}
        </span>
        <span className="text-xs text-zinc-400">
          {job.progress?.stage ?? job.status}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {job.error && (
        <p className="mt-1 text-xs text-red-400">{job.error}</p>
      )}
    </div>
  );
}
