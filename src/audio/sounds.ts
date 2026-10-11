/**
 * The sound list and the mix. This is the one file to tune by hand.
 *
 * Each key is a sound id. Files in audio-src/ are matched by name: `shot.wav`,
 * or `shot_01.wav`, `shot_02.wav`… for random variations. Sounds without a file
 * play a synthesised placeholder. See audio-src/README.md.
 *
 * In development, press ` (backquote) for the audio panel. Its Save button
 * writes slider values back into this file, so keep one sound per line.
 */

export type Bus = 'sfx' | 'music' | 'ui';

export interface SoundDef {
  /** Linear gain (1 = unity). */
  gain: number;
  /** Playback rate (2 = an octave up). */
  rate?: number;
  /** Random pitch variation per play, ± semitones. */
  jitter?: number;
  /** Max overlapping plays; the oldest is cut. Default 8. */
  voices?: number;
  /** Minimum seconds between plays. */
  cooldown?: number;
  /** Default 'sfx'. */
  bus?: Bus;
  /** Plays continuously while the game wants it (engine, alarms…). */
  loop?: boolean;
}

const defs = {
  // One-shots
  launch: { gain: 0.8 },
  shot: { gain: 0.35, jitter: 1, voices: 4 },
  impact: { gain: 0.3, jitter: 2, voices: 3, cooldown: 0.05 },
  explode_small: { gain: 0.8, jitter: 1.5, voices: 4 },
  explode_jet: { gain: 0.8, jitter: 1, voices: 3 },
  explode_fuel: { gain: 0.8, jitter: 1, voices: 3 },
  explode_bridge: { gain: 1 },
  checkpoint: { gain: 0.5, bus: 'ui' },
  crash: { gain: 1 },
  fuel_full: { gain: 0.45, bus: 'ui' },
  extra_life: { gain: 0.5, bus: 'ui' },
  respawn: { gain: 0.45, bus: 'ui' },
  game_over: { gain: 0.6, bus: 'ui' },

  // Loops
  engine_low: { gain: 0.45, loop: true },
  engine_mid: { gain: 0.3, loop: true },
  engine_high: { gain: 0.12, loop: true },
  refuel: { gain: 0.35, loop: true },
  low_fuel: { gain: 0.3, bus: 'ui', loop: true },
  jet_pass: { gain: 0.5, loop: true },
  heli_rotor: { gain: 0.35, loop: true },

  // Music stems: same length and tempo, started together
  music_1: { gain: 0.8, bus: 'music', loop: true },
  music_2: { gain: 0.8, bus: 'music', loop: true },
  music_3: { gain: 0.8, bus: 'music', loop: true },
  music_4: { gain: 0.8, bus: 'music', loop: true },
  music_tension: { gain: 0.8, bus: 'music', loop: true },
} satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof defs;
export const SOUNDS: Record<SoundId, SoundDef> = defs;
export const SOUND_IDS = Object.keys(SOUNDS) as SoundId[];

export const ENGINE = {
  /** Playback rate at the slowest flight speed. */
  rateSlow: 0.8,
  /** Playback rate at the fastest flight speed. */
  rateFast: 1.35,
  /** Engine level while waiting to launch. */
  idle: 0.5,
};

export const MIX = {
  master: 0.8,
  sfx: 1,
  music: 0.7,
  ui: 0.9,
  /** Music level while ducked under crashes and bridge explosions. */
  duck: 0.35,
  /** World units to the side at which a sound is panned hard left or right. */
  panWidth: 40,
  /** Distance ahead at which one-shots play at half volume. */
  halfDistance: 150,
  /** Play synthesised stand-ins for sounds that have no file. */
  placeholders: true,
};

export interface MusicLayer {
  id: SoundId;
  /** First sector (1-based, as shown in the HUD) the layer plays in. */
  fromSector: number;
}

/** Adaptive music: all stems loop in sync and fade in as the run goes deeper. */
export const MUSIC: { layers: MusicLayer[]; tension: SoundId; fade: number; muffle: number } = {
  layers: [
    { id: 'music_1', fromSector: 1 },
    { id: 'music_2', fromSector: 3 },
    { id: 'music_3', fromSector: 6 },
    { id: 'music_4', fromSector: 10 },
  ],
  /** Joins while fuel is low. */
  tension: 'music_tension',
  /** Seconds for a layer to fade in or out. */
  fade: 2,
  /** Low-pass cutoff in Hz while crashed or waiting to relaunch. */
  muffle: 500,
};
