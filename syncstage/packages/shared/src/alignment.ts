import type { AlignedWord, SegmentRange, WordTiming } from "./schemas";

/** Build a fresh alignment map word list from analysis word timings. */
export function wordsFromAnalysis(words: WordTiming[]): AlignedWord[] {
  return words.map((w) => ({
    id: w.id,
    text: w.text,
    start: w.start,
    end: w.end,
    offset: 0,
  }));
}

/** Effective (user-corrected) time range of a word. */
export function effectiveRange(w: AlignedWord): SegmentRange {
  return { start: w.start + w.offset, end: w.end + w.offset };
}

/**
 * Compute the minimal set of time ranges that must be re-rendered after a set
 * of words changed. Each touched word contributes its effective range padded
 * by `padSeconds` on both sides; overlapping/adjacent ranges are merged.
 * Segment re-rendering only these ranges (typically 2-6s each) is what makes
 * interactive editing affordable.
 */
export function dirtyRangesForWords(
  changed: AlignedWord[],
  padSeconds = 1.0,
  duration?: number
): SegmentRange[] {
  const ranges = changed
    .map((w) => {
      const r = effectiveRange(w);
      return {
        start: Math.max(0, r.start - padSeconds),
        end: duration !== undefined ? Math.min(duration, r.end + padSeconds) : r.end + padSeconds,
      };
    })
    .sort((a, b) => a.start - b.start);
  return mergeRanges(ranges);
}

/** Merge overlapping or touching ranges (input must be sorted by start). */
export function mergeRanges(ranges: SegmentRange[]): SegmentRange[] {
  const out: SegmentRange[] = [];
  for (const r of ranges) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/** Snap a time to the nearest beat if within `tolerance` seconds. */
export function snapToBeat(
  t: number,
  beats: number[],
  tolerance = 0.12
): number {
  if (beats.length === 0) return t;
  // binary search nearest beat
  let lo = 0;
  let hi = beats.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  const candidates = [beats[lo]];
  if (lo > 0) candidates.push(beats[lo - 1]);
  let best = t;
  let bestDist = tolerance;
  for (const b of candidates) {
    const d = Math.abs(b - t);
    if (d < bestDist) {
      best = b;
      bestDist = d;
    }
  }
  return best;
}

/** Words whose effective range intersects [start, end). */
export function wordsInRange(
  words: AlignedWord[],
  range: SegmentRange
): AlignedWord[] {
  return words.filter((w) => {
    const r = effectiveRange(w);
    return r.end > range.start && r.start < range.end;
  });
}
