"use client";

import { useCallback, useRef } from "react";
import { useEditorStore } from "@/lib/editorStore";
import clsx from "clsx";

/**
 * Video lane: top row is the generated avatar segments (amber while a
 * pending re-render covers them); bottom row is user-placed b-roll cutaways
 * with drag-to-move + snap-to-beat.
 */
export function VideoLane() {
  const { clips, dirtyRanges, pxPerSec, broll, brollAssets, selectedBrollId } =
    useEditorStore();
  const dragState = useRef<{ id: string; startX: number; origStart: number } | null>(
    null
  );

  const onBrollPointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      e.stopPropagation();
      const b = useEditorStore.getState().broll.find((x) => x.id === id);
      if (!b) return;
      dragState.current = { id, startX: e.clientX, origStart: b.start };
      useEditorStore.getState().selectBroll(id);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragState.current;
      if (!drag) return;
      const deltaSec = (e.clientX - drag.startX) / pxPerSec;
      useEditorStore.getState().moveBroll(drag.id, drag.origStart + deltaSec);
    },
    [pxPerSec]
  );

  const onPointerUp = useCallback(() => {
    dragState.current = null;
  }, []);

  function isDirty(range: { start: number; end: number }) {
    return dirtyRanges.some(
      (d) => d.end > range.start && d.start < range.end
    );
  }

  return (
    <div
      className="relative h-24"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
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

      {/* b-roll row */}
      {broll.map((b) => {
        const asset = brollAssets.find((a) => a.assetId === b.assetId);
        return (
          <div
            key={b.id}
            className={clsx(
              "absolute top-12 flex h-10 cursor-ew-resize items-center gap-1 overflow-hidden rounded border px-1.5 text-[10px]",
              "border-cyan-700 bg-cyan-900/40 text-cyan-200",
              b.id === selectedBrollId && "ring-1 ring-stage-accent2"
            )}
            style={{
              left: b.start * pxPerSec,
              width: Math.max(12, b.duration * pxPerSec),
            }}
            title={`${asset?.name ?? "b-roll"} @ ${b.start.toFixed(2)}s${b.kenBurns ? " · Ken Burns" : ""}`}
            onPointerDown={(e) => onBrollPointerDown(e, b.id)}
          >
            <span className="truncate">
              {asset?.isStill ? "🖼" : "🎞"} {asset?.name ?? "b-roll"}
            </span>
            <button
              className="ml-auto shrink-0 rounded px-1 text-cyan-400 hover:bg-cyan-800 hover:text-white"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                useEditorStore.getState().removeBroll(b.id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}

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
