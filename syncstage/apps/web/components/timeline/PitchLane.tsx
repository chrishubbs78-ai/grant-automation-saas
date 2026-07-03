"use client";

import { useMemo } from "react";
import { useEditorStore } from "@/lib/editorStore";

const LANE_H = 56;
const F_MIN = 65; // C2
const F_MAX = 1047; // C6

/**
 * CREPE pitch curve as an SVG path (log-frequency Y axis). Serves as the
 * visual anchor for matching mouth-open intensity to sustained notes.
 */
export function PitchLane() {
  const { analysis, pxPerSec, duration } = useEditorStore();

  const path = useMemo(() => {
    if (!analysis) return "";
    const logMin = Math.log2(F_MIN);
    const logMax = Math.log2(F_MAX);
    let d = "";
    let penDown = false;
    for (const p of analysis.pitch) {
      const voiced = p.f0 >= F_MIN && p.conf >= 0.5;
      if (!voiced) {
        penDown = false;
        continue;
      }
      const x = p.t * pxPerSec;
      const yNorm = (Math.log2(p.f0) - logMin) / (logMax - logMin);
      const y = LANE_H - 4 - yNorm * (LANE_H - 8);
      d += penDown ? ` L ${x.toFixed(1)} ${y.toFixed(1)}` : ` M ${x.toFixed(1)} ${y.toFixed(1)}`;
      penDown = true;
    }
    return d;
  }, [analysis, pxPerSec]);

  return (
    <svg
      className="block"
      width={Math.max(1, duration * pxPerSec)}
      height={LANE_H}
    >
      <path d={path} fill="none" stroke="#22d3ee" strokeWidth={1.5} />
    </svg>
  );
}
