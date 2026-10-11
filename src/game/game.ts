import { River } from '../world/river';

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
}

/** Things that happened during a step. Renderer and audio react to these. */
export type GameEvent =
  | { type: 'launch' }
  | { type: 'crash'; x: number; y: number }
  | { type: 'reset' };

export type Phase = 'ready' | 'playing' | 'crashed';

export const STEP = 1 / 60;

export const SPEED_SLOW = 18;
export const SPEED_CRUISE = 32;
export const SPEED_FAST = 56;
const SPEED_ACCEL = 45;
const MAX_LATERAL = 28;
const LATERAL_ACCEL = 160;
const RESTART_DELAY = 0.8;

/** Hitbox sample points relative to the plane (x right, y forward). */
const HITBOX: ReadonlyArray<readonly [number, number]> = [
  [0, 1.8],
  [-1.3, -0.9],
  [1.3, -0.9],
  [0, -1.0],
];

const approach = (v: number, target: number, maxDelta: number) =>
  v < target ? Math.min(v + maxDelta, target) : Math.max(v - maxDelta, target);

export class Game {
  readonly river: River;
  phase: Phase = 'ready';
  /** Seconds spent in the current phase. */
  phaseTime = 0;

  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  vx = 0;
  speed = SPEED_CRUISE;

  private prevFire = false;
  private events: GameEvent[] = [];

  constructor(seed: number) {
    this.river = new River(seed);
  }

  /** Lateral velocity as a fraction of max, for banking visuals. */
  get bank(): number {
    return this.vx / MAX_LATERAL;
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  step(dt: number, input: InputState): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.phaseTime += dt;
    const firePressed = input.fire && !this.prevFire;
    this.prevFire = input.fire;

    if (this.phase === 'ready') {
      if (firePressed) this.setPhase('playing', { type: 'launch' });
      return;
    }
    if (this.phase === 'crashed') {
      if (firePressed && this.phaseTime > RESTART_DELAY) {
        this.reset();
        this.setPhase('playing', { type: 'launch' });
      }
      return;
    }

    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    this.vx = approach(this.vx, steer * MAX_LATERAL, LATERAL_ACCEL * dt);
    const targetSpeed = input.up ? SPEED_FAST : input.down ? SPEED_SLOW : SPEED_CRUISE;
    this.speed = approach(this.speed, targetSpeed, SPEED_ACCEL * dt);

    this.x += this.vx * dt;
    this.y += this.speed * dt;

    if (this.hitsBank()) {
      this.setPhase('crashed', { type: 'crash', x: this.x, y: this.y });
    }
  }

  private hitsBank(): boolean {
    return HITBOX.some(([dx, dy]) => !this.river.isWater(this.x + dx, this.y + dy));
  }

  private reset(): void {
    this.x = this.y = this.prevX = this.prevY = this.vx = 0;
    this.speed = SPEED_CRUISE;
    this.events.push({ type: 'reset' });
  }

  private setPhase(phase: Phase, event: GameEvent): void {
    this.phase = phase;
    this.phaseTime = 0;
    this.events.push(event);
  }
}
