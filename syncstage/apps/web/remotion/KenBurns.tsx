import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/** Slow push-in on still images used as b-roll. */
export const KenBurns: React.FC<{ src: string; enabled: boolean }> = ({
  src,
  enabled,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const scale = enabled
    ? interpolate(frame, [0, durationInFrames], [1, 1.12], {
        extrapolateRight: "clamp",
      })
    : 1;
  const translateY = enabled
    ? interpolate(frame, [0, durationInFrames], [0, -3], {
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translateY(${translateY}%)`,
        }}
      />
    </AbsoluteFill>
  );
};
