"use client";

import { useEditorStore } from "@/lib/editorStore";

/** librosa beat grid; downbeats (if present) drawn stronger. */
export function BeatLane() {
  const { analysis, pxPerSec } = useEditorStore();
  if (!analysis) return <div className="h-6" />;

  const downbeatSet = new Set(analysis.downbeats ?? []);

  return (
    <div className="relative h-6 bg-stage-panel/50">
      {analysis.beats.map((b, i) => (
        <div
          key={i}
          className={
            downbeatSet.has(i)
              ? "absolute top-0 h-full w-px bg-stage-accent"
              : "absolute top-1.5 h-3 w-px bg-zinc-600"
          }
          style={{ left: b * pxPerSec }}
        />
      ))}
      <span className="absolute right-1 top-0.5 font-mono text-[9px] text-zinc-600">
        {analysis.tempo_bpm.toFixed(0)} BPM
      </span>
    </div>
  );
}
