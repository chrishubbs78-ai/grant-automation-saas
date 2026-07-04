"use client";

import { create } from "zustand";
import type {
  AlignedWord,
  AlignmentMap,
  AnalysisResult,
  BrollClip,
  SegmentRange,
} from "@syncstage/shared";
import { dirtyRangesForWords, mergeRanges, snapToBeat } from "@syncstage/shared";

export type ClipInfo = {
  assetId: string;
  bucket: string;
  path: string;
  /** song-time range this clip covers */
  range: SegmentRange;
  url?: string;
};

/** An uploaded b-roll asset available to place on the video lane. */
export type BrollAssetInfo = {
  assetId: string;
  url: string;
  isStill: boolean;
  name: string;
};

type EditorState = {
  projectId: string | null;
  analysis: AnalysisResult | null;
  words: AlignedWord[];
  dirtyRanges: SegmentRange[];
  clips: ClipInfo[];
  broll: BrollClip[];
  brollAssets: BrollAssetInfo[];
  selectedBrollId: string | null;
  /** playback */
  currentTime: number;
  playing: boolean;
  duration: number;
  /** view */
  pxPerSec: number;
  /** audio lane source */
  vocalOnly: boolean;
  /** selection */
  selectedWordId: string | null;
  saving: boolean;
  savedVersion: number;

  init: (opts: {
    projectId: string;
    analysis: AnalysisResult;
    map: AlignmentMap | null;
    clips: ClipInfo[];
    brollAssets: BrollAssetInfo[];
  }) => void;
  setCurrentTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setPxPerSec: (v: number) => void;
  setVocalOnly: (v: boolean) => void;
  selectWord: (id: string | null) => void;
  /** Drag a word marker: shift its offset so its start lands at `newStart`. */
  moveWord: (id: string, newStart: number) => void;
  nudgeWord: (id: string, deltaSeconds: number) => void;
  resetWord: (id: string) => void;
  clearDirty: () => void;
  setSaving: (s: boolean) => void;
  bumpVersion: () => void;
  /** b-roll placement (Phase 2): snap-to-beat cutaways over the avatar */
  addBroll: (assetId: string, at: number) => void;
  moveBroll: (id: string, newStart: number) => void;
  removeBroll: (id: string) => void;
  toggleKenBurns: (id: string) => void;
  selectBroll: (id: string | null) => void;
};

export const useEditorStore = create<EditorState>((set, get) => ({
  projectId: null,
  analysis: null,
  words: [],
  dirtyRanges: [],
  clips: [],
  broll: [],
  brollAssets: [],
  selectedBrollId: null,
  currentTime: 0,
  playing: false,
  duration: 0,
  pxPerSec: 60,
  vocalOnly: false,
  selectedWordId: null,
  saving: false,
  savedVersion: 1,

  init: ({ projectId, analysis, map, clips, brollAssets }) =>
    set({
      projectId,
      analysis,
      duration: analysis.duration,
      words:
        map?.words ??
        analysis.words.map((w) => ({ ...w, offset: 0 })),
      dirtyRanges: map?.dirtyRanges ?? [],
      savedVersion: map?.version ?? 1,
      clips,
      broll: map?.broll ?? [],
      brollAssets,
    }),

  setCurrentTime: (t) => set({ currentTime: t }),
  setPlaying: (p) => set({ playing: p }),
  setPxPerSec: (v) => set({ pxPerSec: Math.min(400, Math.max(10, v)) }),
  setVocalOnly: (v) => set({ vocalOnly: v }),
  selectWord: (id) => set({ selectedWordId: id }),

  moveWord: (id, newStart) => {
    const { words, dirtyRanges, duration } = get();
    const idx = words.findIndex((w) => w.id === id);
    if (idx === -1) return;
    const w = words[idx];
    const offset = newStart - w.start;
    const updated = { ...w, offset };
    const next = [...words];
    next[idx] = updated;
    const newDirty = mergeRanges(
      [...dirtyRanges, ...dirtyRangesForWords([updated], 1.0, duration)].sort(
        (a, b) => a.start - b.start
      )
    );
    set({ words: next, dirtyRanges: newDirty });
  },

  nudgeWord: (id, delta) => {
    const w = get().words.find((x) => x.id === id);
    if (!w) return;
    get().moveWord(id, w.start + w.offset + delta);
  },

  resetWord: (id) => {
    const w = get().words.find((x) => x.id === id);
    if (!w) return;
    get().moveWord(id, w.start);
  },

  clearDirty: () => set({ dirtyRanges: [] }),
  setSaving: (s) => set({ saving: s }),
  bumpVersion: () => set((s) => ({ savedVersion: s.savedVersion + 1 })),

  addBroll: (assetId, at) => {
    const { analysis, duration, broll } = get();
    const asset = get().brollAssets.find((a) => a.assetId === assetId);
    if (!asset) return;
    const start = analysis
      ? snapToBeat(Math.max(0, at), analysis.beats, 0.25)
      : Math.max(0, at);
    const clip: BrollClip = {
      id: `b${Date.now().toString(36)}`,
      assetId,
      start: Math.min(start, Math.max(0, duration - 0.5)),
      duration: 4,
      sourceIn: 0,
      kenBurns: asset.isStill,
    };
    set({ broll: [...broll, clip], selectedBrollId: clip.id });
  },

  moveBroll: (id, newStart) => {
    const { broll, analysis, duration } = get();
    set({
      broll: broll.map((b) => {
        if (b.id !== id) return b;
        let start = Math.max(0, Math.min(newStart, duration - b.duration));
        if (analysis) start = snapToBeat(start, analysis.beats, 0.15);
        return { ...b, start };
      }),
    });
  },

  removeBroll: (id) =>
    set((s) => ({
      broll: s.broll.filter((b) => b.id !== id),
      selectedBrollId: s.selectedBrollId === id ? null : s.selectedBrollId,
    })),

  toggleKenBurns: (id) =>
    set((s) => ({
      broll: s.broll.map((b) =>
        b.id === id ? { ...b, kenBurns: !b.kenBurns } : b
      ),
    })),

  selectBroll: (id) => set({ selectedBrollId: id }),
}));
