import { River, SECTION_LEN } from '../world/river';
import { mulberry32 } from './random';

export type EntityKind = 'ship' | 'heli' | 'jet' | 'fuel' | 'bridge';

export interface Entity {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  prevX: number;
  /** Lateral velocity once active; 0 for stationary entities. */
  vx: number;
  halfW: number;
  halfL: number;
  /** Starts moving when the player is this close behind it. */
  activateAt: number;
  active: boolean;
}

export const POINTS: Record<EntityKind, number> = { ship: 30, heli: 60, fuel: 80, jet: 100, bridge: 500 };

const SIZES: Record<Exclude<EntityKind, 'bridge'>, readonly [halfW: number, halfL: number]> = {
  ship: [2.4, 0.9],
  heli: [1.6, 1.1],
  jet: [1.8, 1.0],
  fuel: [1.5, 2.5],
};

/** How far a bridge extends onto each bank. */
export const BRIDGE_OVERHANG = 2;
const BRIDGE_HALF_L = 1.5;

/** Gap between spawn rows; shrinks as difficulty rises. */
const ROW_SPACING = 40;
const ROW_SPACING_HARD = 28;
const SECTION_MARGIN = 90;
const FIRST_SECTION_MARGIN = 160;
/** Jets start this far to the side of the river centre and leave past it. */
export const JET_OFFSET = 90;

/** 0 at the first sector, ramping to 1 by sector 13. */
export function difficulty(section: number): number {
  return Math.min(section / 12, 1);
}

/** True if a box of the given half-extents at (x, y) lies entirely over water. */
export function fitsOnWater(river: River, x: number, y: number, halfW: number, halfL: number): boolean {
  return (
    river.isWater(x - halfW, y - halfL) &&
    river.isWater(x + halfW, y - halfL) &&
    river.isWater(x - halfW, y + halfL) &&
    river.isWater(x + halfW, y + halfL)
  );
}

/**
 * Deterministically populate one sector: rows of enemies and fuel depots,
 * then the bridge that ends it.
 */
export function spawnSection(river: River, section: number, nextId: () => number): Entity[] {
  const rand = mulberry32(river.seed * 7919 + section * 104729);
  const d = difficulty(section);
  const start = section * SECTION_LEN + (section === 0 ? FIRST_SECTION_MARGIN : SECTION_MARGIN);
  const end = (section + 1) * SECTION_LEN - SECTION_MARGIN;
  const spacing = ROW_SPACING + (ROW_SPACING_HARD - ROW_SPACING) * d;
  const fuelEvery = Math.round(4 + 2 * d);
  const out: Entity[] = [];

  const make = (kind: EntityKind, x: number, y: number, halfW: number, halfL: number): Entity => ({
    id: nextId(),
    kind,
    x,
    y,
    prevX: x,
    vx: 0,
    halfW,
    halfL,
    activateAt: Infinity,
    active: false,
  });

  let row = 0;
  for (let y = start; y <= end; y += spacing, row++) {
    const kind = row % fuelEvery === 1 ? 'fuel' : pickEnemy(rand, d, section);
    if (!kind) continue;
    const [halfW, halfL] = SIZES[kind];

    if (kind === 'jet') {
      const side = rand() < 0.5 ? -1 : 1;
      const jet = make('jet', river.sample(y).center + side * JET_OFFSET, y, halfW, halfL);
      jet.vx = -side * (40 + 20 * d);
      jet.activateAt = 110;
      out.push(jet);
      continue;
    }

    const x = pickWaterX(river, rand, y, halfW);
    if (x === null || !fitsOnWater(river, x, y, halfW, halfL)) continue;
    const e = make(kind, x, y, halfW, halfL);
    if (kind !== 'fuel' && rand() < 0.3 + 0.55 * d) {
      const speed = kind === 'ship' ? 7 + 9 * d : 10 + 12 * d;
      e.vx = speed * (rand() < 0.5 ? -1 : 1);
      e.activateAt = 55 + rand() * 50;
    }
    out.push(e);
  }

  const by = (section + 1) * SECTION_LEN;
  const s = river.sample(by);
  out.push(make('bridge', s.center, by, s.halfWidth + BRIDGE_OVERHANG, BRIDGE_HALF_L));
  return out;
}

function pickEnemy(rand: () => number, d: number, section: number): 'ship' | 'heli' | 'jet' | null {
  if (rand() < 0.35 - 0.2 * d) return null;
  const r = rand();
  if (section >= 2 && r < 0.08 + 0.12 * d) return 'jet';
  return r < 0.6 - 0.2 * d ? 'ship' : 'heli';
}

/** Random x inside one of the channels at `y`, keeping `halfW` clear of the banks. */
function pickWaterX(river: River, rand: () => number, y: number, halfW: number): number | null {
  const s = river.sample(y);
  const channels: [number, number][] =
    s.islandHalf > 0
      ? [
          [s.center - s.halfWidth, s.center - s.islandHalf],
          [s.center + s.islandHalf, s.center + s.halfWidth],
        ]
      : [[s.center - s.halfWidth, s.center + s.halfWidth]];
  const [lo, hi] = channels[Math.floor(rand() * channels.length)];
  const margin = halfW + 0.8;
  if (hi - lo < margin * 2) return null;
  return lo + margin + rand() * (hi - lo - margin * 2);
}

/** Advance one entity. Returns false when it should be removed. */
export function updateEntity(e: Entity, river: River, playerY: number, dt: number): boolean {
  e.prevX = e.x;
  if (!e.active && e.y - playerY < e.activateAt) e.active = true;
  if (!e.active || e.vx === 0) return true;

  const nx = e.x + e.vx * dt;
  if (e.kind === 'jet') {
    e.x = nx;
    return Math.abs(nx - river.sample(e.y).center) < JET_OFFSET + 10;
  }
  if (fitsOnWater(river, nx, e.y, e.halfW, e.halfL)) e.x = nx;
  else e.vx = -e.vx;
  return true;
}
