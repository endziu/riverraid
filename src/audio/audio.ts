import type { Entity, EntityKind } from '../game/entities';
import type { Game, GameEvent } from '../game/game';
import { LOW_FUEL, SPEED_FAST, SPEED_SLOW } from '../game/tuning';
import { AudioEngine, Loop } from './engine';
import { clamp, distanceGain, layerWeights, panFor } from './mix';
import { Music } from './music';
import { ENGINE, MIX, type SoundId } from './sounds';

const EXPLOSION: Record<EntityKind, SoundId> = {
  ship: 'explode_small',
  heli: 'explode_small',
  jet: 'explode_jet',
  fuel: 'explode_fuel',
  bridge: 'explode_bridge',
};

const ENGINE_LAYERS: SoundId[] = ['engine_low', 'engine_mid', 'engine_high'];
/** Helicopters are heard from this far ahead. */
const HELI_RANGE = 140;
/** Jets are at half volume this far to the side. */
const JET_RANGE = 45;

/** Turns game events and state into sound. */
export class GameAudio {
  readonly engine = new AudioEngine();
  private readonly music = new Music(this.engine);
  private readonly engineLayers = ENGINE_LAYERS.map((id) => new Loop(this.engine, id));
  private readonly refuel = new Loop(this.engine, 'refuel');
  private readonly lowFuel = new Loop(this.engine, 'low_fuel');
  private readonly heli = new Loop(this.engine, 'heli_rotor');
  private readonly jets = new Map<number, Loop>();
  private sector = 1;

  constructor() {
    window.addEventListener('pointerdown', () => this.engine.unlock());
    window.addEventListener('keydown', (e) => {
      this.engine.unlock();
      if (e.code === 'KeyM' && !e.repeat) this.engine.toggleMute();
    });
  }

  load(): Promise<void> {
    return this.engine.load();
  }

  /** Re-read all files (dev panel) and restart whatever is playing. */
  async reload(): Promise<void> {
    await this.engine.load(true);
    for (const loop of [...this.engineLayers, this.refuel, this.lowFuel, this.heli, ...this.jets.values()]) loop.stop();
    if (this.music.running) this.music.start(this.sector);
  }

  update(game: Game, events: GameEvent[]): void {
    for (const e of events) this.handle(e, game);
    this.sector = game.sector + 1;

    const playing = game.phase === 'playing';
    const lowFuel = playing && game.fuel < LOW_FUEL && !game.refueling;

    // Engine layers crossfade and pitch up with speed.
    const s = clamp((game.speed - SPEED_SLOW) / (SPEED_FAST - SPEED_SLOW), 0, 1);
    const level = playing ? 1 : game.phase === 'ready' ? ENGINE.idle : 0;
    const rate = ENGINE.rateSlow + (ENGINE.rateFast - ENGINE.rateSlow) * s;
    const weights = layerWeights(s, this.engineLayers.length);
    this.engineLayers.forEach((l, i) => l.set(level * weights[i], rate, 0, level ? 0.08 : 0.03));

    this.refuel.set(playing && game.refueling ? 1 : 0, 0.8 + 0.5 * game.fuel);
    this.lowFuel.set(lowFuel ? 1 : 0, 1, 0, 0.01);
    this.updateHeli(game, playing);
    this.updateJets(game, playing);
    this.music.update(this.sector, lowFuel, !playing);
  }

  private handle(e: GameEvent, game: Game): void {
    switch (e.type) {
      case 'launch':
        this.engine.play('launch');
        if (!this.music.running) this.music.start(game.sector + 1);
        break;
      case 'shot':
        this.engine.play('shot');
        break;
      case 'impact':
        this.engine.play('impact', this.at(game, e.x, e.y));
        break;
      case 'destroyed':
        // 0 points means the player rammed it; the crash sound covers that.
        if (e.points === 0) break;
        this.engine.play(EXPLOSION[e.kind], this.at(game, e.x, e.y));
        if (e.kind === 'bridge') {
          this.engine.play('checkpoint', { delay: 0.35 });
          this.engine.duck();
        }
        break;
      case 'crash':
        this.engine.play('crash');
        this.engine.duck();
        break;
      case 'fuelFull':
        this.engine.play('fuel_full');
        break;
      case 'extraLife':
        this.engine.play('extra_life');
        break;
      case 'respawn':
        // A new game respawns and launches in one step; only cue a real respawn.
        if (game.phase === 'ready') this.engine.play('respawn');
        break;
      case 'gameOver':
        this.engine.play('game_over');
        this.music.stop(1.5);
        break;
    }
  }

  /** Pan and distance for something at (x, y). */
  private at(game: Game, x: number, y: number) {
    return { pan: panFor(x - game.x, MIX.panWidth), gain: distanceGain(y - game.y, MIX.halfDistance) };
  }

  /** The nearest helicopter ahead drives one rotor loop. */
  private updateHeli(game: Game, playing: boolean): void {
    let nearest: Entity | null = null;
    for (const e of game.entities) {
      const dy = e.y - game.y;
      if (e.kind === 'heli' && dy > -20 && dy < HELI_RANGE && (!nearest || Math.abs(dy) < Math.abs(nearest.y - game.y))) nearest = e;
    }
    if (!playing || !nearest) return this.heli.set(0);
    const dy = Math.abs(nearest.y - game.y);
    this.heli.set(1 - dy / HELI_RANGE, 1, panFor(nearest.x - game.x, MIX.panWidth));
  }

  /** Each jet in flight gets its own loop, panned and pitched as it crosses. */
  private updateJets(game: Game, playing: boolean): void {
    const seen = new Set<number>();
    if (playing) {
      for (const e of game.entities) {
        if (e.kind !== 'jet' || !e.active) continue;
        seen.add(e.id);
        let loop = this.jets.get(e.id);
        if (!loop) this.jets.set(e.id, (loop = new Loop(this.engine, 'jet_pass')));
        const dx = e.x - game.x;
        // Higher while approaching, lower once past: a cheap doppler.
        const doppler = 1 - 0.12 * Math.tanh((dx * Math.sign(e.vx)) / 15);
        loop.set(1 / (1 + (dx / JET_RANGE) ** 2), doppler, panFor(dx, MIX.panWidth));
      }
    }
    for (const [id, loop] of this.jets) {
      if (seen.has(id)) continue;
      loop.set(0);
      if (loop.idle) {
        loop.dispose();
        this.jets.delete(id);
      }
    }
  }
}
