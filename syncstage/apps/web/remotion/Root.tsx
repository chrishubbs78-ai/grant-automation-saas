import React from "react";
import { Composition } from "remotion";
import { MusicVideo, musicVideoDefaults, MusicVideoProps } from "./MusicVideo";

export const FPS = 30;

/**
 * Compositions registered for the render worker (workers/render bundles this
 * file). Duration/dimensions are overridden per render via calculateMetadata
 * inputProps.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MusicVideo"
        component={MusicVideo}
        durationInFrames={30 * FPS}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={musicVideoDefaults as MusicVideoProps}
        calculateMetadata={({ props }) => {
          const lastClipEnd = Math.max(
            1,
            ...props.clips.map((c) => c.end),
            ...props.words.map((w) => w.end + w.offset)
          );
          return {
            durationInFrames: Math.ceil(lastClipEnd * FPS),
            props,
          };
        }}
      />
    </>
  );
};
