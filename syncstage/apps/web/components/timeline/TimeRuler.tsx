"use client";

import { useMemo } from "react";
import { useEditorStore } from "@/lib/editorStore";

export function TimeRuler() {
  const { duration, pxPerSec } = useEditorStore();

  // Pick a tick interval that keeps labels ≥60px apart.
  const interval = useMemo(() => {
    const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60];
    return candidates.find((c) => c * pxPerSec >= 60) ?? 60;
  }, [pxPerSec]);

  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += interval) ticks.push(t);

  return (
    <div className="relative h-5 border-b border-stage-border bg-stage-panel">
      {ticks.map((t) => (
        <div
          key={t}
          className="absolute top-0 h-full border-l border-stage-border"
          style={{ left: t * pxPerSec }}
        >
          <span className="ml-1 font-mono text-[9px] text-zinc-500">
            {formatTick(t)}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatTick(t: number): string {
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toFixed(s % 1 ? 1 : 0).padStart(2, "0")}`;
}
