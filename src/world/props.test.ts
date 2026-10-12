import { describe, expect, it } from 'vitest';
import { BRIDGE_CLEARANCE, THEME_COUNT, sectionProps, sectorTheme } from './props';
import { River, SECTION_LEN } from './river';

const river = new River(1982);

describe('sectorTheme', () => {
  it('starts on the first theme and never repeats back to back', () => {
    expect(sectorTheme(1982, 0)).toBe(0);
    for (let s = 1; s < 40; s++) {
      const t = sectorTheme(1982, s);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(THEME_COUNT);
      expect(t).not.toBe(sectorTheme(1982, s - 1));
    }
  });
});

describe('sectionProps', () => {
  it('is deterministic per sector', () => {
    expect(sectionProps(river, 3)).toEqual(sectionProps(new River(1982), 3));
    expect(sectionProps(river, 3)).not.toEqual(sectionProps(river, 4));
  });

  it('keeps every footprint on land and clear of bridges', () => {
    for (let section = 0; section < 20; section++) {
      const props = sectionProps(river, section);
      expect(props.length).toBeGreaterThan(0);
      for (const p of props) {
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
          expect(river.isWater(p.x + dx * p.size, p.y + dy * p.size)).toBe(false);
        }
        const toBridge = Math.min(p.y - section * SECTION_LEN, (section + 1) * SECTION_LEN - p.y);
        expect(toBridge).toBeGreaterThanOrEqual(BRIDGE_CLEARANCE);
      }
    }
  });
});
