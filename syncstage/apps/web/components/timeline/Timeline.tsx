"use client";

import { useRef } from "react";
import { useEditorStore } from "@/lib/editorStore";
import { TimeRuler } from "./TimeRuler";
import { WaveLane } from "./WaveLane";
import { WordLane } from "./WordLane";
import { PitchLane } from "./PitchLane";
import { BeatLane } from "./BeatLane";
import { VideoLane } from "./VideoLane";

/**
 * The four-lane timeline. All lanes render inside one horizontally-scrolling
 * container whose inner width is duration * pxPerSec, so pixels line up
 * across lanes by construction. A playhead is drawn across all lanes.
 */
export function Timeline({
  mixUrl,
  vocalUrl,
  onSeek,
}: {
  mixUrl: string | null;
  vocalUrl: string | null;
  onSeek: (t: number) => void;
}) {
  const { duration, pxPerSec, currentTime } = useEditorStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const width = Math.max(1, duration * pxPerSec);

  function handleBackgroundClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
    onSeek(Math.max(0, Math.min(duration, x / pxPerSec)));
  }

  return (
    <div ref={scrollRef} className="h-full overflow-x-auto overflow-y-hidden">
      <div
        className="relative select-none"
        style={{ width, minWidth: "100%" }}
        onClick={handleBackgroundClick}
      >
        <TimeRuler />
        <LaneLabelled label="Waveform">
          <WaveLane mixUrl={mixUrl} vocalUrl={vocalUrl} />
        </LaneLabelled>
        <LaneLabelled label="Words">
          <WordLane />
        </LaneLabelled>
        <LaneLabelled label="Pitch">
          <PitchLane />
        </LaneLabelled>
        <LaneLabelled label="Beats">
          <BeatLane />
        </LaneLabelled>
        <LaneLabelled label="Video">
          <VideoLane />
        </LaneLabelled>

        {/* Playhead */}
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-stage-accent2"
          style={{ left: currentTime * pxPerSec }}
        />
      </div>
    </div>
  );
}

function LaneLabelled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative border-b border-stage-border/50">
      <span className="pointer-events-none absolute left-1 top-0.5 z-10 text-[10px] uppercase tracking-wider text-zinc-600">
        {label}
      </span>
      {children}
    </div>
  );
}
