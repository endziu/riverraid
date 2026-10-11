import { soundFiles, type Loaders } from './files';
import { matchFiles, semitones } from './mix';
import { placeholder } from './placeholders';
import { MIX, SOUNDS, SOUND_IDS, type Bus, type SoundId } from './sounds';

const MUTE_KEY = 'river.muted';
const DEFAULT_VOICES = 8;

export interface PlayOptions {
  pan?: number;
  gain?: number;
  rate?: number;
  /** Seconds from now. */
  delay?: number;
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Web Audio plumbing: buses, buffers and voices. Knows nothing about the game.
 * Graph: voice → bus (sfx / ui / music → duck) → master → limiter → speakers.
 */
export class AudioEngine {
  readonly ctx = new AudioContext({ latencyHint: 'interactive' });
  readonly buses: Record<Bus, GainNode>;
  private readonly master: GainNode;
  private readonly duckGain: GainNode;
  /** Decoded files per sound; variations in name order. */
  private readonly loaded = new Map<SoundId, AudioBuffer[]>();
  private readonly placeholders = new Map<SoundId, AudioBuffer>();
  private readonly voices = new Map<SoundId, Voice[]>();
  private readonly lastPlayed = new Map<SoundId, { time: number; index: number }>();
  /** File paths per sound, and files matching no sound; shown in the dev panel. */
  files = new Map<SoundId, string[]>();
  unmatched: string[] = [];
  muted = localStorage.getItem(MUTE_KEY) === '1';
  private unlocked = false;

  constructor() {
    const ctx = this.ctx;
    const limiter = new DynamicsCompressorNode(ctx, { threshold: -6, knee: 4, ratio: 12, attack: 0.003, release: 0.2 });
    this.master = new GainNode(ctx);
    this.master.connect(limiter).connect(ctx.destination);
    this.duckGain = new GainNode(ctx);
    this.duckGain.connect(this.master);
    this.buses = { sfx: new GainNode(ctx), ui: new GainNode(ctx), music: new GainNode(ctx) };
    this.buses.sfx.connect(this.master);
    this.buses.ui.connect(this.master);
    this.buses.music.connect(this.duckGain);
    this.applyMix();

    // Hidden tabs stop the game loop; stop the sound with it.
    document.addEventListener('visibilitychange', () => {
      if (this.unlocked) void (document.hidden ? ctx.suspend() : ctx.resume());
    });
  }

  /** Browsers only allow audio after a user gesture; call from input handlers. */
  unlock(): void {
    this.unlocked = true;
    if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
  }

  /** Decode every sound file. `fresh` bypasses the browser cache (dev reload). */
  async load(fresh = false): Promise<void> {
    if (!this.placeholders.size) this.makePlaceholders();
    const loaders = soundFiles();
    const { files, unmatched } = matchFiles(Object.keys(loaders), SOUND_IDS);
    if (unmatched.length) console.warn(`[audio] files matching no sound: ${unmatched.join(', ')}`);
    const decoded = await Promise.all(
      [...files].map(async ([id, paths]) => {
        const buffers = await Promise.all(paths.map((p) => this.decode(loaders, p, fresh)));
        return [id, buffers.filter((b): b is AudioBuffer => b !== null)] as const;
      }),
    );
    this.files = files;
    this.unmatched = unmatched;
    this.loaded.clear();
    for (const [id, buffers] of decoded) if (buffers.length) this.loaded.set(id, buffers);
  }

  /** The file variations for a sound, else its placeholder, else nothing. */
  buffersFor(id: SoundId): AudioBuffer[] {
    const files = this.loaded.get(id);
    if (files) return files;
    const stand = MIX.placeholders ? this.placeholders.get(id) : undefined;
    return stand ? [stand] : [];
  }

  /** What a sound currently plays, for the dev panel. */
  sourceOf(id: SoundId): string {
    const n = this.loaded.get(id)?.length ?? 0;
    if (n) return n === 1 ? 'file' : `${n} files`;
    return this.placeholders.has(id) ? 'placeholder' : 'missing';
  }

  play(id: SoundId, opts: PlayOptions = {}): void {
    const buffers = this.buffersFor(id);
    if (!buffers.length) return;
    const def = SOUNDS[id];
    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(id);
    if (last && def.cooldown && now - last.time < def.cooldown) return;

    // Random variation, never the same one twice running.
    let index = Math.floor(Math.random() * buffers.length);
    if (buffers.length > 1 && last && index === last.index) index = (index + 1) % buffers.length;
    this.lastPlayed.set(id, { time: now, index });

    const voices = this.voices.get(id) ?? [];
    this.voices.set(id, voices);
    while (voices.length >= (def.voices ?? DEFAULT_VOICES)) release(voices.shift()!, now);

    const jitter = def.jitter ? (Math.random() * 2 - 1) * def.jitter : 0;
    const source = new AudioBufferSourceNode(this.ctx, {
      buffer: buffers[index],
      playbackRate: (def.rate ?? 1) * (opts.rate ?? 1) * semitones(jitter),
    });
    const gain = new GainNode(this.ctx, { gain: def.gain * (opts.gain ?? 1) });
    const panner = new StereoPannerNode(this.ctx, { pan: opts.pan ?? 0 });
    source.connect(gain).connect(panner).connect(this.buses[def.bus ?? 'sfx']);
    const voice = { source, gain };
    voices.push(voice);
    source.onended = () => {
      const i = voices.indexOf(voice);
      if (i >= 0) voices.splice(i, 1);
      panner.disconnect();
    };
    source.start(now + (opts.delay ?? 0));
  }

  isPlaying(id: SoundId): boolean {
    return (this.voices.get(id)?.length ?? 0) > 0;
  }

  stop(id: SoundId): void {
    const voices = this.voices.get(id) ?? [];
    for (const v of voices.splice(0)) release(v, this.ctx.currentTime);
  }

  /** Briefly pull the music down under a big moment. */
  duck(): void {
    const g = this.duckGain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(MIX.duck, now + 0.05);
    g.setTargetAtTime(1, now + 0.6, 0.6);
  }

  /** Push bus levels from MIX into the graph. */
  applyMix(): void {
    this.master.gain.value = this.muted ? 0 : MIX.master;
    for (const bus of ['sfx', 'ui', 'music'] as const) this.buses[bus].gain.value = MIX[bus];
  }

  toggleMute(): void {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    this.applyMix();
  }

  private makePlaceholders(): void {
    const rate = this.ctx.sampleRate;
    for (const id of SOUND_IDS) {
      const data = placeholder(id, rate);
      if (!data) continue;
      const buffer = this.ctx.createBuffer(1, data.length, rate);
      buffer.getChannelData(0).set(data);
      this.placeholders.set(id, buffer);
    }
  }

  private async decode(loaders: Loaders, path: string, fresh: boolean): Promise<AudioBuffer | null> {
    try {
      const url = await loaders[path]();
      const res = await fetch(fresh ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` : url);
      return await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch (err) {
      console.warn(`[audio] could not load ${path}`, err);
      return null;
    }
  }
}

/** Cut a voice with a quick fade so it doesn't click. */
function release(v: Voice, now: number): void {
  v.gain.gain.setTargetAtTime(0, now, 0.01);
  v.source.stop(now + 0.05);
}

/**
 * A looping sound driven by a level every frame. Starts itself when the level
 * rises above 0 and stops once it has faded back to silence.
 */
export class Loop {
  private source: AudioBufferSourceNode | null = null;
  private readonly gain: GainNode;
  private readonly panner: StereoPannerNode;
  private last = { gain: -1, rate: -1, pan: -2 };
  private silentSince = -1;

  constructor(
    private readonly engine: AudioEngine,
    readonly id: SoundId,
  ) {
    this.gain = new GainNode(engine.ctx, { gain: 0 });
    this.panner = new StereoPannerNode(engine.ctx);
    this.gain.connect(this.panner).connect(engine.buses[SOUNDS[id].bus ?? 'sfx']);
  }

  get idle(): boolean {
    return this.source === null;
  }

  /** `level` 0–1 scales the sound's gain; `smoothing` is the fade time constant in seconds. */
  set(level: number, rate = 1, pan = 0, smoothing = 0.08): void {
    if (level > 0 && !this.source) this.start();
    const source = this.source;
    if (!source) return;
    const now = this.engine.ctx.currentTime;
    const def = SOUNDS[this.id];

    const gain = level * def.gain;
    if (Math.abs(gain - this.last.gain) > 1e-4) this.gain.gain.setTargetAtTime(gain, now, smoothing);
    const r = rate * (def.rate ?? 1);
    if (Math.abs(r - this.last.rate) > 1e-4) source.playbackRate.setTargetAtTime(r, now, 0.05);
    if (Math.abs(pan - this.last.pan) > 1e-3) this.panner.pan.setTargetAtTime(pan, now, 0.05);
    this.last = { gain, rate: r, pan };

    if (level > 0) this.silentSince = -1;
    else if (this.silentSince < 0) this.silentSince = now;
    else if (now - this.silentSince > smoothing * 6 + 0.05) this.stop();
  }

  /** Drop the current source; the next `set` above 0 starts fresh (picks up reloaded files). */
  stop(): void {
    this.source?.stop();
    this.source?.disconnect();
    this.source = null;
    this.silentSince = -1;
  }

  dispose(): void {
    this.stop();
    this.panner.disconnect();
  }

  private start(): void {
    const buffers = this.engine.buffersFor(this.id);
    if (!buffers.length) return;
    const now = this.engine.ctx.currentTime;
    this.source = new AudioBufferSourceNode(this.engine.ctx, {
      buffer: buffers[Math.floor(Math.random() * buffers.length)],
      loop: true,
    });
    this.source.connect(this.gain);
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(0, now);
    this.last = { gain: 0, rate: -1, pan: -2 };
    this.source.start();
  }
}
