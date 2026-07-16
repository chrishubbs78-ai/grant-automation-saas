import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { MusicVideoWord } from "./MusicVideo";

/**
 * Karaoke-style captions from WhisperX word timestamps (with user offsets
 * applied). Shows a sliding window of words around the current time and
 * highlights the active one.
 */
export const LyricCaptions: React.FC<{ words: MusicVideoWord[] }> = ({
  words,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const WINDOW = 3; // seconds of context either side
  const visible = words.filter((w) => {
    const start = w.start + w.offset;
    const end = w.end + w.offset;
    return end > t - WINDOW && start < t + WINDOW;
  });

  if (visible.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "8%",
        left: 0,
        right: 0,
        textAlign: "center",
        padding: "0 6%",
      }}
    >
      <span
        style={{
          display: "inline-block",
          background: "rgba(0,0,0,0.55)",
          borderRadius: 16,
          padding: "12px 28px",
          fontFamily: "Arial, sans-serif",
          fontSize: 44,
          fontWeight: 700,
          lineHeight: 1.35,
        }}
      >
        {visible.map((w, i) => {
          const start = w.start + w.offset;
          const end = w.end + w.offset;
          const active = t >= start && t <= end;
          const past = t > end;
          return (
            <span
              key={`${w.start}-${i}`}
              style={{
                color: active ? "#a78bfa" : past ? "#e4e4e7" : "#71717a",
                transition: "color 80ms linear",
                marginRight: 12,
              }}
            >
              {w.text}
            </span>
          );
        })}
      </span>
    </div>
  );
};
