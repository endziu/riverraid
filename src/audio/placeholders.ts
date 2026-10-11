import { mulberry32 } from '../game/random';
import type { SoundId } from './sounds';

/**
 * Synthesised stand-ins for sounds that have no file yet, so the game is never
 * silent during development. Real files always win.
 * Loops are built from whole cycles (and wrapped filters) so they repeat without a seam.
 */

type Synth = (rate: number) => Float32Array;
type Wave = (phase: number) => number;

const TAU = Math.PI * 2;
const sine: Wave = (p) => Math.sin(TAU * p);
const saw: Wave = (p) => 2 * (p - Math.floor(p)) - 1;
const square: Wave = (p) => (p - Math.floor(p) < 0.5 ? 1 : -1);
const tri: Wave = (p) => 1 - 4 * Math.abs(p - Math.floor(p + 0.5));

const samples = (rate: number, seconds: number) => new Float32Array(Math.round(rate * seconds));

/** Oscillator with a time-varying frequency. */
function osc(rate: number, seconds: number, freq: (t: number) => number, wave: Wave): Float32Array {
  const out = samples(rate, seconds);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    out[i] = wave(phase);
    phase += freq(i / rate) / rate;
  }
  return out;
}

function noise(rate: number, seconds: number, seed: number): Float32Array {
  const rand = mulberry32(seed);
  return samples(rate, seconds).map(() => rand() * 2 - 1);
}

/** One-pole low-pass. `wrap` runs it twice so a loop's end flows into its start. */
function lowpass(input: Float32Array, rate: number, cutoff: number | ((t: number) => number), wrap = false): Float32Array {
  const out = new Float32Array(input.length);
  let y = 0;
  for (let pass = wrap ? 0 : 1; pass < 2; pass++) {
    for (let i = 0; i < input.length; i++) {
      const hz = typeof cutoff === 'number' ? cutoff : cutoff(i / rate);
      y += (1 - Math.exp((-TAU * hz) / rate)) * (input[i] - y);
      out[i] = y;
    }
  }
  return out;
}

function highpass(input: Float32Array, rate: number, cutoff: number, wrap = false): Float32Array {
  const low = lowpass(input, rate, cutoff, wrap);
  return input.map((v, i) => v - low[i]);
}

function shape(input: Float32Array, rate: number, env: (t: number) => number): Float32Array {
  return input.map((v, i) => v * env(i / rate));
}

function mix(...layers: [Float32Array, number][]): Float32Array {
  const out = new Float32Array(Math.max(...layers.map(([b]) => b.length)));
  for (const [b, g] of layers) for (let i = 0; i < b.length; i++) out[i] += b[i] * g;
  return out;
}

function normalize(input: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (const v of input) max = Math.max(max, Math.abs(v));
  return max > 0 ? input.map((v) => (v * peak) / max) : input;
}

/** Normalise and fade the last few milliseconds so one-shots end on silence. */
function finish(input: Float32Array, rate: number, peak: number): Float32Array {
  const out = normalize(input, peak);
  const fade = Math.round(rate * 0.01);
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return out;
}

/** Click-free percussive envelope. */
const hit = (decay: number) => (t: number) => Math.min(1, t / 0.002) * Math.exp(-t * decay);

/** Amplitude modulation; periodic over a loop when `hz` × length is whole. */
const am = (depth: number, hz: number) => (t: number) => 1 - depth + depth * (0.5 + 0.5 * Math.sin(TAU * hz * t));

/** Gate open between `from` and `to` seconds, with short ramps. */
const gate = (from: number, to: number) => (t: number) => Math.max(0, Math.min(1, (t - from) / 0.005, (to - t) / 0.005));

function notes(rate: number, seconds: number, list: [start: number, freq: number][], wave: Wave, decay: number): Float32Array {
  const env = hit(decay);
  return mix(
    ...list.map(([start, f]): [Float32Array, number] => [
      shape(osc(rate, seconds, () => f, wave), rate, (t) => (t < start ? 0 : env(t - start))),
      1,
    ]),
  );
}

function explosion(rate: number, seconds: number, from: number, to: number, decay: number, thump: number, seed: number): Float32Array {
  const cutoff = (t: number) => from * (to / from) ** (t / seconds);
  const body = shape(lowpass(lowpass(noise(rate, seconds, seed), rate, cutoff), rate, cutoff), rate, hit(decay));
  const low = shape(osc(rate, seconds, (t) => thump * (0.4 + Math.exp(-t * 6)), sine), rate, hit(decay * 1.5));
  return mix([normalize(body, 1), 1], [low, 0.7]);
}

/** Harmonics of `f0` with random but fixed phases; seamless when f0 × length is whole. */
function harmonics(rate: number, seconds: number, f0: number, amps: number[], seed: number): Float32Array {
  const rand = mulberry32(seed);
  const phases = amps.map(() => rand());
  const out = samples(rate, seconds);
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    let s = 0;
    for (let n = 0; n < amps.length; n++) s += amps[n] * Math.sin(TAU * (f0 * (n + 1) * t + phases[n]));
    out[i] = s;
  }
  return out;
}

/** Looping band of noise. */
function band(rate: number, seconds: number, lo: number, hi: number, seed: number): Float32Array {
  return highpass(lowpass(lowpass(noise(rate, seconds, seed), rate, hi, true), rate, hi, true), rate, lo, true);
}

const SYNTHS: Partial<Record<SoundId, Synth>> = {
  launch: (r) =>
    finish(
      mix(
        [lowpass(osc(r, 0.8, (t) => 70 * 3.5 ** Math.min(1, t / 0.5), saw), r, 1400), 1],
        [lowpass(noise(r, 0.8, 1), r, 900), 0.6],
      ).map((v, i) => v * Math.min(1, i / r / 0.1) * Math.exp(-Math.max(0, i / r - 0.35) * 7)),
      r,
      0.5,
    ),
  shot: (r) =>
    finish(
      mix(
        [shape(osc(r, 0.14, (t) => 1600 * Math.exp(-t * 25) + 180, square), r, hit(30)), 0.6],
        [shape(highpass(noise(r, 0.14, 2), r, 2000), r, hit(60)), 0.5],
      ),
      r,
      0.45,
    ),
  impact: (r) => finish(shape(highpass(noise(r, 0.09, 3), r, 1500), r, hit(60)), r, 0.3),
  explode_small: (r) => finish(explosion(r, 0.7, 3000, 200, 6, 90, 4), r, 0.6),
  explode_jet: (r) =>
    finish(
      mix(
        [explosion(r, 0.8, 6000, 400, 5, 120, 5), 1],
        [shape(osc(r, 0.8, (t) => 1800 * Math.exp(-t * 4), tri), r, hit(5)), 0.15],
      ),
      r,
      0.6,
    ),
  explode_fuel: (r) =>
    finish(
      mix([explosion(r, 1.0, 4000, 300, 4, 100, 6), 1], [shape(highpass(noise(r, 1.0, 7), r, 4000), r, hit(3)), 0.4]),
      r,
      0.6,
    ),
  explode_bridge: (r) => finish(explosion(r, 2.0, 2500, 80, 2.2, 60, 8), r, 0.8),
  checkpoint: (r) => finish(notes(r, 0.9, [[0, 880], [0.09, 1318.5]], (p) => sine(p) + 0.3 * sine(2 * p), 6), r, 0.4),
  crash: (r) =>
    finish(
      mix(
        [explosion(r, 1.6, 2000, 60, 2.5, 70, 9), 1],
        [shape(lowpass(osc(r, 1.6, (t) => 400 * Math.exp(-t * 2.5), saw), r, 1200), r, hit(3)), 0.3],
      ),
      r,
      0.8,
    ),
  fuel_full: (r) => finish(notes(r, 0.35, [[0, 1046.5], [0.07, 1568]], sine, 18), r, 0.4),
  extra_life: (r) =>
    finish(notes(r, 0.9, [[0, 523.25], [0.08, 659.25], [0.16, 783.99], [0.24, 1046.5]], tri, 8), r, 0.45),
  respawn: (r) =>
    finish(
      shape(osc(r, 0.4, (t) => 300 * 3 ** Math.min(1, t / 0.35), sine), r, (t) => Math.min(1, t / 0.03) * Math.exp(-t * 6)),
      r,
      0.4,
    ),
  game_over: (r) =>
    finish(notes(r, 1.8, [[0, 392], [0.22, 329.63], [0.44, 261.63], [0.66, 196]], tri, 3), r, 0.5),

  engine_low: (r) =>
    normalize(
      mix(
        [shape(harmonics(r, 1, 55, [1, 0.5, 0.33, 0.25, 0.2, 0.17, 0.14, 0.12], 10), r, am(0.25, 6)), 1],
        [normalize(band(r, 1, 30, 200, 11), 1), 0.25],
      ),
      0.5,
    ),
  engine_mid: (r) =>
    normalize(
      mix(
        [shape(harmonics(r, 1, 110, [1, 0.6, 0.4, 0.3, 0.2, 0.15], 12), r, am(0.15, 12)), 1],
        [normalize(band(r, 1, 400, 2000, 13), 1), 0.2],
      ),
      0.5,
    ),
  engine_high: (r) => normalize(shape(harmonics(r, 1, 660, [1, 0.3, 0.15], 14), r, am(0.1, 9)), 0.4),
  refuel: (r) => normalize(shape(harmonics(r, 1, 520, [1, 0, 0.4], 15), r, am(0.6, 12)), 0.4),
  low_fuel: (r) =>
    normalize(
      shape(osc(r, 1, () => 988, tri), r, (t) => gate(0, 0.12)(t) + gate(0.25, 0.37)(t)),
      0.4,
    ),
  jet_pass: (r) => normalize(mix([band(r, 2, 500, 4000, 16), 1], [band(r, 2, 40, 300, 17), 0.6]), 0.5),
  heli_rotor: (r) =>
    normalize(
      shape(band(r, 1, 80, 700, 18), r, (t) => 0.2 + 0.8 * Math.max(0, Math.sin(TAU * 15 * t)) ** 3),
      0.5,
    ),
};

/** Mono samples at `rate` Hz, or null when the sound has no placeholder (music). */
export function placeholder(id: SoundId, rate: number): Float32Array | null {
  return SYNTHS[id]?.(rate) ?? null;
}
