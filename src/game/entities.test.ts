import { describe, expect, it } from 'vitest';
import { River, SECTION_LEN } from '../world/river';
import { fitsOnWater, spawnSection, updateEntity } from './entities';

const counter = () => {
  let id = 0;
  return () => ++id;
};

describe('spawnSection', () => {
  const river = new River(1982);

  it('is deterministic', () => {
    const strip = (es: ReturnType<typeof spawnSection>) => es.map(({ id: _id, ...rest }) => rest);
    expect(strip(spawnSection(river, 3, counter()))).toEqual(strip(spawnSection(river, 3, counter())));
  });

  it('ends every sector with a bridge across the river', () => {
    for (let section = 0; section < 10; section++) {
      const bridges = spawnSection(river, section, counter()).filter((e) => e.kind === 'bridge');
      expect(bridges).toHaveLength(1);
      expect(bridges[0].y).toBe((section + 1) * SECTION_LEN);
      expect(bridges[0].halfW).toBeGreaterThan(river.sample(bridges[0].y).halfWidth);
    }
  });

  it('places boats, helicopters and fuel on open water', () => {
    for (let section = 0; section < 20; section++) {
      for (const e of spawnSection(river, section, counter())) {
        if (e.kind === 'bridge' || e.kind === 'jet') continue;
        expect(fitsOnWater(river, e.x, e.y, e.halfW, e.halfL)).toBe(true);
      }
    }
  });

  it('provides at least two fuel depots per sector', () => {
    for (let section = 0; section < 20; section++) {
      const fuel = spawnSection(river, section, counter()).filter((e) => e.kind === 'fuel');
      expect(fuel.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('gets busier with difficulty', () => {
    const enemies = (section: number) =>
      spawnSection(river, section, counter()).filter((e) => e.kind !== 'fuel' && e.kind !== 'bridge');
    const early = enemies(0);
    const late = [12, 13, 14].flatMap(enemies);
    expect(late.length / 3).toBeGreaterThan(early.length);
    expect(late.some((e) => e.kind === 'jet')).toBe(true);
    expect(early.some((e) => e.kind === 'jet')).toBe(false);
  });
});

describe('updateEntity', () => {
  it('keeps patrolling boats on the water', () => {
    const river = new River(1982);
    const boat = spawnSection(river, 10, counter()).find((e) => e.kind === 'ship' && e.vx !== 0)!;
    for (let i = 0; i < 60 * 20; i++) {
      updateEntity(boat, river, boat.y, 1 / 60);
      expect(fitsOnWater(river, boat.x, boat.y, boat.halfW, boat.halfL)).toBe(true);
    }
  });
});
