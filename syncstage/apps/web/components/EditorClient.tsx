"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnalysisResult, AlignmentMap } from "@syncstage/shared";
import { createClient } from "@/lib/supabase/client";
import { signedUrl } from "@/lib/storage";
import { enqueueJob } from "@/lib/jobs";
import {
  useEditorStore,
  type BrollAssetInfo,
  type ClipInfo,
} from "@/lib/editorStore";
import { Timeline } from "@/components/timeline/Timeline";
import { PlayerPreview } from "@/components/PlayerPreview";

type AssetRow = {
  id: string;
  kind: string;
  bucket: string;
  storage_path: string;
  mime_type: string | null;
  range: { start: number; end: number } | null;
  created_at: string;
};

export function EditorClient({
  project,
  assets,
  alignmentRow,
}: {
  project: { id: string; title: string; duration: number | null };
  assets: AssetRow[];
  alignmentRow: { data: unknown; version: number } | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const store = useEditorStore();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mixUrl, setMixUrl] = useState<string | null>(null);
  const [vocalUrl, setVocalUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Load analysis.json + signed audio URLs + clip URLs, then init the store.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const analysisAsset = assets.find((a) => a.kind === "analysis");
        const songAsset = assets.find((a) => a.kind === "song");
        const vocalAsset = assets.find((a) => a.kind === "vocal_stem");
        if (!analysisAsset || !songAsset) {
          setLoadError(
            "This project has no analysis yet. Upload a song and wait for analysis to finish."
          );
          setLoading(false);
          return;
        }

        const [analysisUrl, songUrl, vocalStemUrl] = await Promise.all([
          signedUrl(analysisAsset.bucket, analysisAsset.storage_path),
          signedUrl(songAsset.bucket, songAsset.storage_path),
          vocalAsset
            ? signedUrl(vocalAsset.bucket, vocalAsset.storage_path)
            : Promise.resolve(null),
        ]);

        const analysisJson = await (await fetch(analysisUrl)).json();
        const analysis = AnalysisResult.parse(analysisJson);

        // Oldest first: newer segment re-renders come later in the array and
        // therefore overlay the original chunks in the Remotion sequence.
        const clipAssets = assets
          .filter((a) => a.kind === "avatar_clip" && a.range)
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        const clips: ClipInfo[] = await Promise.all(
          clipAssets.map(async (a) => ({
            assetId: a.id,
            bucket: a.bucket,
            path: a.storage_path,
            range: a.range!,
            url: await signedUrl(a.bucket, a.storage_path),
          }))
        );

        const brollAssets: BrollAssetInfo[] = await Promise.all(
          assets
            .filter((a) => a.kind === "broll")
            .map(async (a) => ({
              assetId: a.id,
              url: await signedUrl(a.bucket, a.storage_path),
              isStill: (a.mime_type ?? "").startsWith("image/"),
              name: a.storage_path.split("/").pop() ?? "b-roll",
            }))
        );

        let map: AlignmentMap | null = null;
        if (alignmentRow) {
          const parsed = AlignmentMap.safeParse(alignmentRow.data);
          if (parsed.success) map = parsed.data;
        }

        if (cancelled) return;
        store.init({ projectId: project.id, analysis, map, clips, brollAssets });
        setMixUrl(songUrl);
        setVocalUrl(vocalStemUrl);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // The <audio> element is the playback clock; the store mirrors its time.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    let raf = 0;
    const tick = () => {
      if (!el.paused) {
        useEditorStore.getState().setCurrentTime(el.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mixUrl]);

  // Keyboard shortcuts: space = play/pause, ←/→ = nudge selected word by
  // 10ms (Shift: 100ms), Delete = remove selected b-roll, Esc = deselect.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const s = useEditorStore.getState();
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (!s.selectedWordId) return;
        e.preventDefault();
        const step = (e.shiftKey ? 0.1 : 0.01) * (e.key === "ArrowLeft" ? -1 : 1);
        s.nudgeWord(s.selectedWordId, step);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (s.selectedBrollId) {
          e.preventDefault();
          s.removeBroll(s.selectedBrollId);
        }
      } else if (e.key === "Escape") {
        s.selectWord(null);
        s.selectBroll(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.currentTime = store.currentTime;
      void el.play();
      store.setPlaying(true);
    } else {
      el.pause();
      store.setPlaying(false);
    }
  }

  function seek(t: number) {
    const el = audioRef.current;
    store.setCurrentTime(t);
    if (el) el.currentTime = t;
  }

  async function save() {
    if (!store.projectId) return;
    store.setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const data: AlignmentMap = {
      version: store.savedVersion + 1,
      project_id: store.projectId,
      words: store.words,
      broll: store.broll,
      dirtyRanges: store.dirtyRanges,
    };
    const { error } = await supabase.from("alignment_maps").upsert({
      project_id: store.projectId,
      user_id: user.id,
      version: data.version,
      data,
    });
    store.setSaving(false);
    if (!error) store.bumpVersion();
  }

  async function rerenderDirty() {
    if (!store.projectId || store.dirtyRanges.length === 0) return;
    await save();
    for (const range of store.dirtyRanges) {
      await enqueueJob(store.projectId, "segment_rerender", { range });
    }
    store.clearDirty();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-400">
        Loading editor…
      </main>
    );
  }
  if (loadError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-zinc-300">{loadError}</p>
        <Link href={`/project/${project.id}`} className="btn-secondary">
          ← Back to project
        </Link>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-stage-border px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            href={`/project/${project.id}`}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            ← {project.title}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary !py-1 text-xs" onClick={save} disabled={store.saving}>
            {store.saving ? "Saving…" : "Save"}
          </button>
          <button
            className="btn-primary !py-1 text-xs"
            onClick={rerenderDirty}
            disabled={store.dirtyRanges.length === 0}
          >
            Re-render {store.dirtyRanges.length || ""} edited segment
            {store.dirtyRanges.length === 1 ? "" : "s"}
          </button>
        </div>
      </header>

      {/* Preview */}
      <div className="flex min-h-0 flex-1 items-center justify-center bg-black/40 p-4">
        <PlayerPreview mixUrl={mixUrl} />
      </div>

      {/* Transport */}
      <div className="flex items-center gap-4 border-t border-stage-border px-4 py-2">
        <button className="btn-secondary !px-3 !py-1" onClick={togglePlay}>
          {store.playing ? "⏸" : "▶"}
        </button>
        <span className="font-mono text-xs text-zinc-400">
          {formatTime(store.currentTime)} / {formatTime(store.duration)}
        </span>
        {store.brollAssets.length > 0 && (
          <BrollPicker />
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={store.vocalOnly}
              onChange={(e) => store.setVocalOnly(e.target.checked)}
              disabled={!vocalUrl}
            />
            Vocal stem
          </label>
          <span>Zoom</span>
          <input
            type="range"
            min={10}
            max={400}
            value={store.pxPerSec}
            onChange={(e) => store.setPxPerSec(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="h-[320px] shrink-0 overflow-hidden border-t border-stage-border">
        <Timeline mixUrl={mixUrl} vocalUrl={vocalUrl} onSeek={seek} />
      </div>

      {/* Hidden playback element (switches between mix and vocal stem) */}
      <audio
        ref={audioRef}
        src={(store.vocalOnly && vocalUrl) || mixUrl || undefined}
        onEnded={() => store.setPlaying(false)}
      />
    </main>
  );
}

function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

/** Pick an uploaded b-roll asset and drop it on the lane at the playhead. */
function BrollPicker() {
  const { brollAssets } = useEditorStore();
  const [assetId, setAssetId] = useState(brollAssets[0]?.assetId ?? "");

  return (
    <div className="flex items-center gap-1 text-xs">
      <select
        className="input !w-40 !py-1"
        value={assetId}
        onChange={(e) => setAssetId(e.target.value)}
      >
        {brollAssets.map((a) => (
          <option key={a.assetId} value={a.assetId}>
            {a.isStill ? "🖼 " : "🎞 "}
            {a.name}
          </option>
        ))}
      </select>
      <button
        className="btn-secondary !py-1 text-xs"
        onClick={() => {
          const s = useEditorStore.getState();
          if (assetId) s.addBroll(assetId, s.currentTime);
        }}
      >
        + B-roll at playhead
      </button>
    </div>
  );
}
