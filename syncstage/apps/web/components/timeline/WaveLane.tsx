"use client";

import { useEffect, useRef } from "react";
import { useEditorStore } from "@/lib/editorStore";

/**
 * Waveform lane rendered by wavesurfer.js. Toggles between the full mix and
 * the isolated vocal stem. Zoom follows the shared pxPerSec so it stays
 * pixel-aligned with the other lanes.
 */
export function WaveLane({
  mixUrl,
  vocalUrl,
}: {
  mixUrl: string | null;
  vocalUrl: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<import("wavesurfer.js").default | null>(null);
  const { pxPerSec, vocalOnly } = useEditorStore();

  const url = vocalOnly && vocalUrl ? vocalUrl : mixUrl;

  useEffect(() => {
    if (!containerRef.current || !url) return;
    let destroyed = false;
    let ws: import("wavesurfer.js").default | null = null;

    void import("wavesurfer.js").then(({ default: WaveSurfer }) => {
      if (destroyed || !containerRef.current) return;
      ws = WaveSurfer.create({
        container: containerRef.current,
        url,
        height: 64,
        waveColor: "#5b21b6",
        progressColor: "#5b21b6",
        cursorWidth: 0,
        interact: false,
        minPxPerSec: useEditorStore.getState().pxPerSec,
        fillParent: false,
        normalize: true,
      });
      wsRef.current = ws;
    });

    return () => {
      destroyed = true;
      ws?.destroy();
      wsRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    wsRef.current?.zoom(pxPerSec);
  }, [pxPerSec]);

  return <div ref={containerRef} className="h-16" />;
}
