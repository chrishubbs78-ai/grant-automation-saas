import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  useVideoConfig,
} from "remotion";
import { LyricCaptions } from "./LyricCaptions";
import { KenBurns } from "./KenBurns";

export type MusicVideoClip = {
  /** signed URL (preview) or local path (render) of the avatar clip */
  src: string;
  /** song-time range in seconds this clip covers */
  start: number;
  end: number;
};

export type MusicVideoBroll = {
  src: string;
  isStill: boolean;
  start: number;
  duration: number;
  kenBurns: boolean;
};

export type MusicVideoWord = {
  text: string;
  start: number;
  end: number;
  offset: number;
};

export type MusicVideoProps = {
  /** full mix — only reunited with the video here, at composition level */
  audioSrc: string | null;
  clips: MusicVideoClip[];
  broll: MusicVideoBroll[];
  words: MusicVideoWord[];
  watermark: boolean;
};

export const musicVideoDefaults: MusicVideoProps = {
  audioSrc: null,
  clips: [],
  broll: [],
  words: [],
  watermark: true,
};

/**
 * The one composition that powers both the live browser preview and the
 * server-side MP4 render — identical code, so no preview/output drift.
 */
export const MusicVideo: React.FC<MusicVideoProps> = ({
  audioSrc,
  clips,
  broll,
  words,
  watermark,
}) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {audioSrc && <Audio src={audioSrc} />}

      {/* Avatar clips, full-frame, sequenced by song time */}
      {clips.map((clip, i) => (
        <Sequence
          key={i}
          from={Math.round(clip.start * fps)}
          durationInFrames={Math.max(1, Math.round((clip.end - clip.start) * fps))}
        >
          <AbsoluteFill>
            <OffthreadVideo
              src={clip.src}
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </AbsoluteFill>
        </Sequence>
      ))}

      {/* B-roll cutaways over the avatar */}
      {broll.map((b, i) => (
        <Sequence
          key={`broll-${i}`}
          from={Math.round(b.start * fps)}
          durationInFrames={Math.max(1, Math.round(b.duration * fps))}
        >
          {b.isStill ? (
            <KenBurns src={b.src} enabled={b.kenBurns} />
          ) : (
            <AbsoluteFill>
              <OffthreadVideo
                src={b.src}
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </AbsoluteFill>
          )}
        </Sequence>
      ))}

      <LyricCaptions words={words} />

      {watermark && (
        <div
          style={{
            position: "absolute",
            bottom: 24,
            right: 32,
            fontFamily: "Arial, sans-serif",
            fontSize: 28,
            fontWeight: 700,
            color: "rgba(255,255,255,0.55)",
            letterSpacing: 1,
          }}
        >
          SyncStage
        </div>
      )}
    </AbsoluteFill>
  );
};
