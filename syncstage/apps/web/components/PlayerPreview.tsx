"use client";

import { useEffect, useMemo, useRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { MusicVideo, type MusicVideoProps } from "@/remotion/MusicVideo";
import { FPS } from "@/remotion/Root";
import { useEditorStore } from "@/lib/editorStore";

/**
 * Live preview driven by the same MusicVideo composition the server renders.
 * The editor's <audio> element is the playback clock; the Player is kept
 * muted and seeked to follow it, so word-offset edits show up instantly.
 */
export function PlayerPreview({ mixUrl }: { mixUrl: string | null }) {
  const playerRef = useRef<PlayerRef>(null);
  const { words, clips, duration, currentTime, playing } = useEditorStore();

  const inputProps: MusicVideoProps = useMemo(
    () => ({
      audioSrc: null, // audio comes from the editor's clock element
      clips: clips
        .filter((c) => c.url)
        .map((c) => ({ src: c.url!, start: c.range.start, end: c.range.end })),
      broll: [],
      words: words.map((w) => ({
        text: w.text,
        start: w.start,
        end: w.end,
        offset: w.offset,
      })),
      watermark: false,
    }),
    [clips, words]
  );

  // Follow the transport.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (playing) {
      if (!player.isPlaying()) player.play();
      // re-sync if drifted > 3 frames
      const drift = Math.abs(player.getCurrentFrame() / FPS - currentTime);
      if (drift > 3 / FPS) player.seekTo(Math.round(currentTime * FPS));
    } else {
      if (player.isPlaying()) player.pause();
      player.seekTo(Math.round(currentTime * FPS));
    }
  }, [currentTime, playing]);

  const durationInFrames = Math.max(1, Math.ceil(duration * FPS));

  return (
    <div className="aspect-video h-full max-h-full max-w-full overflow-hidden rounded-lg border border-stage-border">
      <Player
        ref={playerRef}
        component={MusicVideo}
        inputProps={inputProps}
        durationInFrames={durationInFrames}
        fps={FPS}
        compositionWidth={1920}
        compositionHeight={1080}
        style={{ width: "100%", height: "100%" }}
        controls={false}
        loop={false}
        initiallyMuted
      />
    </div>
  );
}
