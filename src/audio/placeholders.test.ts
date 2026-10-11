import { describe, expect, it } from 'vitest';
import { placeholder } from './placeholders';
import { SOUNDS, SOUND_IDS } from './sounds';

const RATE = 48000;

describe('placeholders', () => {
  const sounds = SOUND_IDS.filter((id) => SOUNDS[id].bus !== 'music');

  it.each(sounds)('%s is a clean, audible buffer', (id) => {
    const data = placeholder(id, RATE)!;
    expect(data).not.toBeNull();
    let peak = 0;
    for (const v of data) {
      expect(Number.isFinite(v)).toBe(true);
      peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it.each(sounds.filter((id) => !SOUNDS[id].loop))('one-shot %s ends on silence', (id) => {
    const data = placeholder(id, RATE)!;
    expect(Math.abs(data[data.length - 1])).toBeLessThan(1e-3);
  });

  it.each(sounds.filter((id) => SOUNDS[id].loop))('loop %s wraps without a jump', (id) => {
    const data = placeholder(id, RATE)!;
    let maxStep = 0;
    for (let i = 1; i < data.length; i++) maxStep = Math.max(maxStep, Math.abs(data[i] - data[i - 1]));
    expect(Math.abs(data[0] - data[data.length - 1])).toBeLessThanOrEqual(maxStep);
  });

  it('has no placeholder music', () => {
    expect(placeholder('music_1', RATE)).toBeNull();
  });
});
