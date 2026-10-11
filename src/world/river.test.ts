import { describe, expect, it } from 'vitest';
import { MIN_CHANNEL, River } from './river';

describe('River', () => {
  it('is deterministic for a seed', () => {
    const a = new River(42);
    const b = new River(42);
    for (let y = 0; y < 5000; y += 37) expect(a.sample(y)).toEqual(b.sample(y));
  });

  it('differs between seeds', () => {
    expect(new River(1).sample(2000)).not.toEqual(new River(2).sample(2000));
  });

  it('starts straight and centred so the player spawns on water', () => {
    const river = new River(7);
    const s = river.sample(0);
    expect(s.center).toBe(0);
    expect(s.islandHalf).toBe(0);
    expect(river.isWater(0, 0)).toBe(true);
  });

  it('always leaves channels at least MIN_CHANNEL wide', () => {
    for (const seed of [1, 1982, 31337]) {
      const river = new River(seed);
      for (let y = 0; y < 20000; y += 3) {
        const s = river.sample(y);
        expect(s.halfWidth - s.islandHalf).toBeGreaterThanOrEqual(MIN_CHANNEL - 1e-9);
      }
    }
  });

  it('treats banks and islands as land', () => {
    const river = new River(1982);
    const s = river.sample(0);
    expect(river.isWater(s.center + s.halfWidth + 1, 0)).toBe(false);
    expect(river.isWater(s.center - s.halfWidth - 1, 0)).toBe(false);
  });
});
