"use client";

import { useCallback, useRef } from "react";
import { useEditorStore } from "@/lib/editorStore";
import { snapToBeat } from "@syncstage/shared";
import clsx from "clsx";

/**
 * Draggable word markers from WhisperX. Dragging shifts a word's offset in
 * the alignment map and flags the touched range for segment re-render.
 * Hold Shift while dragging to disable beat snapping.
 */
export function WordLane() {
  const { words, pxPerSec, selectedWordId, analysis } = useEditorStore();
  const laneRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    id: string;
    startX: number;
    origStart: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      e.stopPropagation();
      const w = words.find((x) => x.id === id);
      if (!w) return;
      dragState.current = {
        id,
        startX: e.clientX,
        origStart: w.start + w.offset,
      };
      useEditorStore.getState().selectWord(id);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [words]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragState.current;
      if (!drag) return;
      const deltaSec = (e.clientX - drag.startX) / pxPerSec;
      let newStart = Math.max(0, drag.origStart + deltaSec);
      if (!e.shiftKey && analysis) {
        newStart = snapToBeat(newStart, analysis.beats, 8 / pxPerSec);
      }
      useEditorStore.getState().moveWord(drag.id, newStart);
    },
    [pxPerSec, analysis]
  );

  const onPointerUp = useCallback(() => {
    dragState.current = null;
  }, []);

  return (
    <div
      ref={laneRef}
      className="relative h-10"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {words.map((w) => {
        const left = (w.start + w.offset) * pxPerSec;
        const width = Math.max(4, (w.end - w.start) * pxPerSec);
        const edited = w.offset !== 0;
        return (
          <div
            key={w.id}
            title={`${w.text}${edited ? ` (${w.offset >= 0 ? "+" : ""}${w.offset.toFixed(2)}s)` : ""}`}
            className={clsx(
              "absolute top-1.5 h-7 cursor-ew-resize overflow-hidden whitespace-nowrap rounded border px-1 text-[10px] leading-7",
              edited
                ? "border-amber-500 bg-amber-500/20 text-amber-200"
                : "border-stage-border bg-zinc-800/80 text-zinc-300",
              w.id === selectedWordId && "ring-1 ring-stage-accent2"
            )}
            style={{ left, width }}
            onPointerDown={(e) => onPointerDown(e, w.id)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              useEditorStore.getState().resetWord(w.id);
            }}
          >
            {w.text}
          </div>
        );
      })}
    </div>
  );
}
