import type { AudioEngine } from './engine';
import { MUSIC, SOUNDS, type SoundId } from './sounds';

interface Stem {
  id: SoundId;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** Adaptive music: stems start together and loop in sync; layers fade by sector and fuel. */
export class Music {
  private stems: Stem[] = [];
  private readonly filter: BiquadFilterNode;
  private muffled = false;

  constructor(private readonly engine: AudioEngine) {
    this.filter = new BiquadFilterNode(engine.ctx, { type: 'lowpass', frequency: 20000 });
    this.filter.connect(engine.buses.music);
  }

  get running(): boolean {
    return this.stems.length > 0;
  }

  /** Start from the top, with the layers for `sector` already in. */
  start(sector: number): void {
    this.stop(0.05);
    const ctx = this.engine.ctx;
    const t0 = ctx.currentTime + 0.05;
    for (const id of [...MUSIC.layers.map((l) => l.id), MUSIC.tension]) {
      const buffer = this.engine.buffersFor(id)[0];
      if (!buffer) continue;
      const source = new AudioBufferSourceNode(ctx, { buffer, loop: true });
      const gain = new GainNode(ctx, { gain: this.target(id, sector, false) });
      source.connect(gain).connect(this.filter);
      source.start(t0);
      this.stems.push({ id, source, gain });
    }
    const lengths = new Set(this.stems.map((s) => s.source.buffer!.length));
    if (lengths.size > 1) console.warn('[audio] music stems differ in length and will drift apart');
  }

  stop(fade: number): void {
    const now = this.engine.ctx.currentTime;
    for (const s of this.stems) {
      s.gain.gain.setTargetAtTime(0, now, fade / 4);
      s.source.stop(now + fade);
    }
    this.stems = [];
  }

  update(sector: number, tension: boolean, muffled: boolean): void {
    const now = this.engine.ctx.currentTime;
    for (const s of this.stems) s.gain.gain.setTargetAtTime(this.target(s.id, sector, tension), now, MUSIC.fade / 3);
    if (muffled !== this.muffled) {
      this.muffled = muffled;
      this.filter.frequency.setTargetAtTime(muffled ? MUSIC.muffle : 20000, now, muffled ? 0.15 : 0.3);
    }
  }

  private target(id: SoundId, sector: number, tension: boolean): number {
    const on = id === MUSIC.tension ? tension : sector >= (MUSIC.layers.find((l) => l.id === id)?.fromSector ?? Infinity);
    return on ? SOUNDS[id].gain : 0;
  }
}
