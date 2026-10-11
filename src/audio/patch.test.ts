import { describe, expect, it } from 'vitest';
import { patchSounds } from './patch';

const SOURCE = `const defs = {
  // One-shots
  shot: { gain: 0.35, jitter: 1, voices: 4 },
  checkpoint: { gain: 0.5, bus: 'ui' },
} satisfies Record<string, SoundDef>;

export const ENGINE = {
  /** Playback rate at the slowest flight speed. */
  rateSlow: 0.8,
  idle: 0.5,
};

export const MIX = {
  master: 0.8,
  music: 0.7,
  placeholders: true,
};
`;

describe('patchSounds', () => {
  it('rewrites sound lines and block values, keeping everything else', () => {
    const out = patchSounds(SOURCE, {
      sounds: { shot: { gain: 0.41234, voices: 4, rate: 1.2 }, checkpoint: { gain: 0.5, bus: 'ui' } },
      blocks: { ENGINE: { rateSlow: 0.75, idle: 0.5 }, MIX: { master: 1, music: 0.5, placeholders: false } },
    });
    expect(out).toContain('  // One-shots\n  shot: { gain: 0.412, voices: 4, rate: 1.2 },\n');
    expect(out).toContain("  checkpoint: { gain: 0.5, bus: 'ui' },");
    expect(out).toContain('  /** Playback rate at the slowest flight speed. */\n  rateSlow: 0.75,\n');
    expect(out).toContain('  master: 1,\n  music: 0.5,\n  placeholders: false,\n');
  });

  it('leaves a block untouched when it is missing from the source', () => {
    expect(patchSounds(SOURCE, { sounds: {}, blocks: { MUSIC: { fade: 3 } } })).toBe(SOURCE);
  });
});
