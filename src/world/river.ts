import { fbm } from './noise';

/**
 * Cross-section of the river at a given distance `y`.
 * Water spans |x - center| in (islandHalf, halfWidth); islandHalf = 0 means no island.
 */
export interface RiverSlice {
  center: number;
  halfWidth: number;
  islandHalf: number;
}

export const BANK_HEIGHT = 3;
/** Narrowest a navigable channel may get (full width). */
export const MIN_CHANNEL = 7;

const START_STRAIGHT = 120;
const START_BLEND = 220;
const START_HALF_WIDTH = 18;
const ISLAND_THRESHOLD = 22;

/** Smooth versions of min/max; `k` controls how rounded the corner is. */
const smoothMax = (a: number, b: number, k: number) => 0.5 * (a + b + Math.sqrt((a - b) ** 2 + k));
const smoothMin = (a: number, b: number, k: number) => -smoothMax(-a, -b, k);

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

export class River {
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  sample(y: number): RiverSlice {
    const t = smoothstep(START_STRAIGHT, START_STRAIGHT + START_BLEND, y);
    const center = 34 * fbm(this.seed, y / 260, 2) * t;

    const n = fbm(this.seed + 77, y / 150, 3);
    const generated = smoothMin(smoothMax(19 + 26 * n, MIN_CHANNEL + 1, 16), 38, 16);
    const halfWidth = START_HALF_WIDTH + (generated - START_HALF_WIDTH) * t;

    let islandHalf = 0;
    if (halfWidth > ISLAND_THRESHOLD) {
      islandHalf = Math.min((halfWidth - ISLAND_THRESHOLD) * 1.8, halfWidth - MIN_CHANNEL);
    }
    return { center, halfWidth, islandHalf };
  }

  isWater(x: number, y: number): boolean {
    const s = this.sample(y);
    const d = Math.abs(x - s.center);
    return d < s.halfWidth && (s.islandHalf === 0 || d > s.islandHalf);
  }
}
