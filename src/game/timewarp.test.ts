import { describe, expect, it } from 'vitest';
import { TimeWarp, timeScale } from './timewarp';
import { CRASH_TIME, HIT_STOP, SLOWMO_SCALE, STEP } from './tuning';

const playing = { phase: 'playing' as const, phaseTime: 0, lives: 2 };

describe('TimeWarp', () => {
  it('passes time through untouched normally', () => {
    expect(new TimeWarp().advance(STEP, playing)).toBe(STEP);
  });

  it('freezes for a few frames after a crash', () => {
    const warp = new TimeWarp();
    warp.react([{ type: 'crash', x: 0, y: 0, cause: 'terrain' }]);
    const frames = Array.from({ length: 6 }, () => warp.advance(STEP, playing));
    const frozen = frames.filter((dt) => dt === 0).length;
    expect(frozen).toBe(Math.round(HIT_STOP / STEP));
    expect(frames.at(-1)).toBe(STEP);
  });

  it('freezes on a bridge kill but not on a small kill or a rammed bridge', () => {
    const kill = (kind: 'ship' | 'bridge', points: number) => {
      const warp = new TimeWarp();
      warp.react([{ type: 'destroyed', id: 1, kind, x: 0, y: 0, points }]);
      return warp.advance(STEP, playing);
    };
    expect(kill('bridge', 500)).toBe(0);
    expect(kill('ship', 30)).toBe(STEP);
    expect(kill('bridge', 0)).toBe(STEP);
  });

  it('slows the final crash and eases back to full speed', () => {
    const final = (phaseTime: number) => timeScale({ phase: 'crashed', phaseTime, lives: 0 });
    expect(final(0)).toBe(SLOWMO_SCALE);
    expect(final(CRASH_TIME / 2)).toBeGreaterThan(SLOWMO_SCALE);
    expect(final(CRASH_TIME)).toBe(1);
    expect(timeScale({ phase: 'crashed', phaseTime: 0, lives: 1 })).toBe(1);
  });
});
