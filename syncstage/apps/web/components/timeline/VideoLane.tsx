"use client";

import { useEditorStore } from "@/lib/editorStore";
import clsx from "clsx";

/**
 * Avatar clip segments on the video lane. Segments covered by a pending
 * dirty range are tinted amber until their re-render lands. B-roll clips
 * (Phase 2) will live on a second row of this lane.
 */
export function VideoLane() {
  const { clips, dirtyRanges, pxPerSec } = useEditorStore();

  function isDirty(range: { start: number; end: number }) {
    return dirtyRanges.some(
      (d) => d.end > range.start && d.start < range.end
    );
  }

  return (
    <div className="relative h-12">
      {clips.length === 0 && (
        <span className="absolute left-1/2 top-3 -translate-x-1/2 text-xs text-zinc-600">
          No avatar clips yet — generate the avatar first
        </span>
      )}
      {clips.map((c) => (
        <div
          key={c.assetId}
          className={clsx(
            "absolute top-1 flex h-10 items-center justify-center overflow-hidden rounded border text-[10px]",
            isDirty(c.range)
              ? "border-amber-500 bg-amber-500/15 text-amber-300"
              : "border-violet-700 bg-violet-900/40 text-violet-300"
          )}
          style={{
            left: c.range.start * pxPerSec,
            width: Math.max(8, (c.range.end - c.range.start) * pxPerSec),
          }}
          title={`Avatar ${c.range.start.toFixed(1)}s – ${c.range.end.toFixed(1)}s`}
        >
          🎤 {c.range.start.toFixed(0)}–{c.range.end.toFixed(0)}s
        </div>
      ))}

      {/* dirty range overlays */}
      {dirtyRanges.map((d, i) => (
        <div
          key={i}
          className="pointer-events-none absolute inset-y-0 bg-amber-400/10"
          style={{
            left: d.start * pxPerSec,
            width: (d.end - d.start) * pxPerSec,
          }}
        />
      ))}
    </div>
  );
}
