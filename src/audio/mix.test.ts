import { describe, expect, it } from 'vitest';
import { distanceGain, layerWeights, matchFiles, panFor } from './mix';

describe('matchFiles', () => {
  const ids = ['shot', 'engine_low', 'music_1', 'music_tension'] as const;

  it('matches exact names and numbered variations', () => {
    const { files, unmatched } = matchFiles(
      ['/audio-src/shot_02.wav', '/audio-src/shot_01.wav', '/audio-src/engine_low.wav', '/audio-src/music_1.wav'],
      ids,
    );
    expect(files.get('shot')).toEqual(['/audio-src/shot_01.wav', '/audio-src/shot_02.wav']);
    expect(files.get('engine_low')).toEqual(['/audio-src/engine_low.wav']);
    expect(files.get('music_1')).toEqual(['/audio-src/music_1.wav']);
    expect(unmatched).toEqual([]);
  });

  it('ignores case and reports unknown files', () => {
    const { files, unmatched } = matchFiles(['/audio-src/Shot.WAV', '/audio-src/shoot.wav', '/audio-src/music_2.wav'], ids);
    expect(files.get('shot')).toEqual(['/audio-src/Shot.WAV']);
    expect(unmatched).toEqual(['/audio-src/music_2.wav', '/audio-src/shoot.wav']);
  });
});

describe('layerWeights', () => {
  it('starts on the first layer and ends on the last', () => {
    expect(layerWeights(0, 3).map((w) => +w.toFixed(6))).toEqual([1, 0, 0]);
    expect(layerWeights(1, 3).map((w) => +w.toFixed(6))).toEqual([0, 0, 1]);
    expect(layerWeights(0.5, 3).map((w) => +w.toFixed(6))).toEqual([0, 1, 0]);
  });

  it('keeps constant power through the crossfade', () => {
    for (let s = 0; s <= 1; s += 0.05) {
      const power = layerWeights(s, 3).reduce((sum, w) => sum + w * w, 0);
      expect(power).toBeCloseTo(1, 6);
    }
  });
});

describe('panning and distance', () => {
  it('pans hard at the pan width and clamps beyond', () => {
    expect(panFor(0, 40)).toBe(0);
    expect(panFor(-40, 40)).toBe(-1);
    expect(panFor(100, 40)).toBe(1);
  });

  it('halves gain at the half distance', () => {
    expect(distanceGain(5, 150)).toBe(1);
    expect(distanceGain(160, 150)).toBeCloseTo(0.5);
  });
});
