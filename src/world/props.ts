import { mulberry32 } from '../game/random';
import { River, SECTION_LEN } from './river';

/** Number of colour themes sectors cycle through; the renderer defines the colours. */
export const THEME_COUNT = 5;

/** Theme index for a sector: 0 for the first, then never the same twice in a row. */
export function sectorTheme(seed: number, section: number): number {
  let theme = 0;
  for (let s = 1; s <= section; s++) {
    const rand = mulberry32(seed * 4447 + s * 2953);
    theme = (theme + 1 + Math.floor(rand() * (THEME_COUNT - 1))) % THEME_COUNT;
  }
  return theme;
}

export type PropKind = 'tower' | 'pylon' | 'block' | 'beacon';

/** A bank structure. (x, y) is its footprint centre on the land; `size` is its half-width. */
export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  size: number;
  height: number;
  /** Pylons sharing a chain are linked by cables, in array order. */
  chain?: number;
}

/** Keep structures this far from bridges so roads and towers stay clear. */
export const BRIDGE_CLEARANCE = 24;
/** Closest a structure's footprint may get to the water. */
const BANK_MARGIN = 1.5;
const MAX_OFFSET = 70;

/**
 * Deterministically decorate the banks of one sector with towers, pylon runs,
 * low blocks and beacons. Everything sits on the outer banks, clear of the water.
 */
export function sectionProps(river: River, section: number): Prop[] {
  const rand = mulberry32(river.seed * 6271 + section * 33721 + 17);
  const y0 = section * SECTION_LEN + BRIDGE_CLEARANCE;
  const y1 = (section + 1) * SECTION_LEN - BRIDGE_CLEARANCE;
  const out: Prop[] = [];

  // Power-line runs following one bank.
  const runs = rand() < 0.65 ? 1 + (rand() < 0.3 ? 1 : 0) : 0;
  for (let r = 0; r < runs; r++) {
    const side = rand() < 0.5 ? -1 : 1;
    const offset = 7 + rand() * 12;
    const length = 160 + rand() * 220;
    const start = y0 + rand() * Math.max(y1 - y0 - length, 0);
    const chain = section * 10 + r;
    for (let y = start; y <= Math.min(start + length, y1); y += 32) {
      const s = river.sample(y);
      const x = s.center + side * (s.halfWidth + offset);
      if (onLand(river, x, y, 0.8)) out.push({ kind: 'pylon', x, y, size: 0.8, height: 11, chain });
    }
  }

  // Scattered structures on both banks.
  for (let y = y0; y < y1; y += 14 + rand() * 26) {
    for (const side of [-1, 1]) {
      if (rand() > 0.35) continue;
      const s = river.sample(y);
      const r = rand();
      const kind: PropKind = r < 0.3 ? 'tower' : r < 0.75 ? 'block' : 'beacon';
      const size = kind === 'block' ? 2 + rand() * 4 : kind === 'tower' ? 1 + rand() * 0.6 : 1.4 + rand();
      const height = kind === 'tower' ? 8 + rand() * 14 : kind === 'block' ? 1.5 + rand() * 4 : 3 + rand() * 3;
      const offset = size + 3 + rand() * rand() * MAX_OFFSET;
      const x = s.center + side * (s.halfWidth + offset);
      if (onLand(river, x, y, size) && !out.some((p) => Math.hypot(p.x - x, p.y - y) < p.size + size + 2)) {
        out.push({ kind, x, y, size, height });
      }
    }
  }
  return out;
}

/** True if a square footprint at (x, y) lies on the outer banks with a margin from the water. */
function onLand(river: River, x: number, y: number, size: number): boolean {
  for (const dy of [-size, 0, size]) {
    const s = river.sample(y + dy);
    const outside = Math.abs(x - s.center) - size;
    if (outside < s.halfWidth + BANK_MARGIN) return false;
  }
  return true;
}
