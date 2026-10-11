/** Pure helpers for the audio layer. */

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const semitones = (n: number) => 2 ** (n / 12);

/** Stereo pan for something `dx` units to the side of the player. */
export function panFor(dx: number, width: number): number {
  return clamp(dx / width, -1, 1);
}

/** 1 near the player, 0.5 at `half` units further away. */
export function distanceGain(dy: number, half: number): number {
  return half / (half + Math.max(0, Math.abs(dy) - 10));
}

/** Equal-power crossfade weights across `count` layers as `s` goes 0 → 1. */
export function layerWeights(s: number, count: number): number[] {
  const p = clamp(s, 0, 1) * (count - 1);
  return Array.from({ length: count }, (_, i) => Math.cos((clamp(p - i, -1, 1) * Math.PI) / 2));
}

/**
 * Assign file paths to sound ids by file name: `shot.wav` or `shot_01.wav`,
 * `shot_02.wav`… Exact names win, so `music_1.wav` is the sound `music_1`.
 */
export function matchFiles<Id extends string>(
  paths: readonly string[],
  ids: readonly Id[],
): { files: Map<Id, string[]>; unmatched: string[] } {
  const known = new Set<string>(ids);
  const files = new Map<Id, string[]>();
  const unmatched: string[] = [];
  for (const path of [...paths].sort()) {
    const base = path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '').toLowerCase();
    const id = known.has(base) ? base : base.replace(/_\d+$/, '');
    if (!known.has(id)) {
      unmatched.push(path);
      continue;
    }
    const list = files.get(id as Id) ?? [];
    list.push(path);
    files.set(id as Id, list);
  }
  return { files, unmatched };
}
