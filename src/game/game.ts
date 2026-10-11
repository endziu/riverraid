import { River, SECTION_LEN } from '../world/river';
import { POINTS, spawnSection, updateEntity, type Entity, type EntityKind } from './entities';
import {
  BULLET_HALF_L,
  BULLET_HALF_W,
  BULLET_RANGE,
  BULLET_SPEED,
  CRASH_TIME,
  CULL_BEHIND,
  EXTRA_LIFE_EVERY,
  FIRE_COOLDOWN,
  FUEL_DRAIN,
  GAME_OVER_DELAY,
  LATERAL_ACCEL,
  LOW_FUEL,
  MAX_LATERAL,
  MAX_LIVES,
  PLAYER_HALF_L,
  PLAYER_HALF_W,
  REFUEL_RATE,
  SPAWN_AHEAD,
  SPEED_ACCEL,
  SPEED_CRUISE,
  SPEED_FAST,
  SPEED_SLOW,
  START_LIVES,
} from './tuning';

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
}

export type CrashCause = 'terrain' | 'enemy' | 'bridge' | 'fuel';

/** Things that happened during a step. Renderer and audio react to these. */
export type GameEvent =
  | { type: 'launch' }
  | { type: 'shot'; x: number; y: number }
  | { type: 'impact'; x: number; y: number }
  | { type: 'destroyed'; kind: EntityKind; x: number; y: number; points: number }
  | { type: 'crash'; x: number; y: number; cause: CrashCause }
  | { type: 'refuelStart' }
  | { type: 'refuelStop' }
  | { type: 'fuelFull' }
  | { type: 'lowFuel' }
  | { type: 'extraLife' }
  | { type: 'respawn' }
  | { type: 'gameOver' };

export type Phase = 'ready' | 'playing' | 'crashed' | 'gameover';

export interface Bullet {
  x: number;
  y: number;
  prevY: number;
  vy: number;
}

/** Bank hitbox sample points relative to the plane (x right, y forward). */
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

  fuel = 1;
  refueling = false;
  score = 0;
  lives = START_LIVES;
  /** Index of the sector the player restarts at (= bridges destroyed). */
  checkpoint = 0;

  entities: Entity[] = [];
  bullets: Bullet[] = [];

  private nextId = 1;
  private generatedTo = -1;
  private fireCooldown = 0;
  private prevFire = false;
  private nextExtraLife = EXTRA_LIFE_EVERY;
  private lowFuelWarned = false;
  private events: GameEvent[] = [];

  constructor(seed: number) {
    this.river = new River(seed);
    this.respawn();
    this.events = [];
  }

  /** Lateral velocity as a fraction of max, for banking visuals. */
  get bank(): number {
    return this.vx / MAX_LATERAL;
  }

  /** 0-based index of the sector the player is in. */
  get sector(): number {
    return Math.floor(this.y / SECTION_LEN);
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  step(dt: number, input: InputState): void {
    this.prevX = this.x;
    this.prevY = this.y;
    for (const b of this.bullets) b.prevY = b.y;
    this.phaseTime += dt;
    const firePressed = input.fire && !this.prevFire;
    this.prevFire = input.fire;

    switch (this.phase) {
      case 'ready':
        if (firePressed) this.launch();
        return;
      case 'crashed':
        this.updateWorld(dt);
        if (this.phaseTime >= CRASH_TIME) {
          if (this.lives > 0) {
            this.respawn();
            this.setPhase('ready');
          } else {
            this.setPhase('gameover', { type: 'gameOver' });
          }
        }
        return;
      case 'gameover':
        if (firePressed && this.phaseTime >= GAME_OVER_DELAY) {
          this.newGame();
          this.launch();
        }
        return;
    }

    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    this.vx = approach(this.vx, steer * MAX_LATERAL, LATERAL_ACCEL * dt);
    const targetSpeed = input.up ? SPEED_FAST : input.down ? SPEED_SLOW : SPEED_CRUISE;
    this.speed = approach(this.speed, targetSpeed, SPEED_ACCEL * dt);
    this.x += this.vx * dt;
    this.y += this.speed * dt;

    this.fireCooldown -= dt;
    if (input.fire && this.fireCooldown <= 0) {
      this.fireCooldown = FIRE_COOLDOWN;
      const y = this.y + 2;
      this.bullets.push({ x: this.x, y, prevY: y, vy: this.speed + BULLET_SPEED });
      this.events.push({ type: 'shot', x: this.x, y });
    }

    this.updateWorld(dt);
    this.updateFuel(dt);
    if (this.phase === 'playing') this.checkCollisions();
  }

  private launch(): void {
    this.fireCooldown = 0.25;
    this.setPhase('playing', { type: 'launch' });
  }

  private updateWorld(dt: number): void {
    const want = Math.floor((this.y + SPAWN_AHEAD) / SECTION_LEN);
    while (this.generatedTo < want) {
      this.generatedTo++;
      this.entities.push(...spawnSection(this.river, this.generatedTo, () => this.nextId++));
    }
    this.bullets = this.bullets.filter((b) => this.updateBullet(b, dt));
    this.entities = this.entities.filter(
      (e) => updateEntity(e, this.river, this.y, dt) && e.y > this.y - CULL_BEHIND,
    );
  }

  /** Returns false when the bullet is spent. */
  private updateBullet(b: Bullet, dt: number): boolean {
    b.y += b.vy * dt;
    if (b.y - this.y > BULLET_RANGE) return false;
    const hit = this.entities.find(
      (e) =>
        Math.abs(b.x - e.x) < e.halfW + BULLET_HALF_W &&
        b.y + BULLET_HALF_L > e.y - e.halfL &&
        b.prevY - BULLET_HALF_L < e.y + e.halfL,
    );
    if (hit) {
      this.destroy(hit, POINTS[hit.kind]);
      return false;
    }
    if (!this.river.isWater(b.x, b.y)) {
      this.events.push({ type: 'impact', x: b.x, y: b.y });
      return false;
    }
    return true;
  }

  private destroy(e: Entity, points: number): void {
    this.entities.splice(this.entities.indexOf(e), 1);
    this.events.push({ type: 'destroyed', kind: e.kind, x: e.x, y: e.y, points });
    if (e.kind === 'bridge') this.checkpoint = Math.round(e.y / SECTION_LEN);
    this.addScore(points);
  }

  private addScore(points: number): void {
    this.score += points;
    while (this.score >= this.nextExtraLife) {
      this.nextExtraLife += EXTRA_LIFE_EVERY;
      if (this.lives < MAX_LIVES) {
        this.lives++;
        this.events.push({ type: 'extraLife' });
      }
    }
  }

  private updateFuel(dt: number): void {
    const over = this.entities.some((e) => e.kind === 'fuel' && this.overlaps(e));
    if (over !== this.refueling) {
      this.refueling = over;
      this.events.push({ type: over ? 'refuelStart' : 'refuelStop' });
    }
    if (over) {
      const wasFull = this.fuel >= 1;
      this.fuel = Math.min(1, this.fuel + REFUEL_RATE * dt);
      if (!wasFull && this.fuel >= 1) this.events.push({ type: 'fuelFull' });
    } else {
      this.fuel = Math.max(0, this.fuel - FUEL_DRAIN * dt);
    }

    if (this.fuel > LOW_FUEL) {
      this.lowFuelWarned = false;
    } else if (!this.lowFuelWarned) {
      this.lowFuelWarned = true;
      this.events.push({ type: 'lowFuel' });
    }
    if (this.fuel <= 0) this.crash('fuel');
  }

  private checkCollisions(): void {
    if (HITBOX.some(([dx, dy]) => !this.river.isWater(this.x + dx, this.y + dy))) {
      this.crash('terrain');
      return;
    }
    const hit = this.entities.find((e) => e.kind !== 'fuel' && this.overlaps(e));
    if (hit) {
      this.destroy(hit, 0);
      this.crash(hit.kind === 'bridge' ? 'bridge' : 'enemy');
    }
  }

  private overlaps(e: Entity): boolean {
    return Math.abs(this.x - e.x) < PLAYER_HALF_W + e.halfW && Math.abs(this.y - e.y) < PLAYER_HALF_L + e.halfL;
  }

  private crash(cause: CrashCause): void {
    this.lives--;
    if (this.refueling) {
      this.refueling = false;
      this.events.push({ type: 'refuelStop' });
    }
    this.setPhase('crashed', { type: 'crash', x: this.x, y: this.y, cause });
  }

  /** Put the plane back at the current checkpoint with a fresh sector. */
  private respawn(): void {
    this.y = this.prevY = this.checkpoint * SECTION_LEN;
    this.x = this.prevX = this.river.sample(this.y).center;
    this.vx = 0;
    this.speed = SPEED_CRUISE;
    this.fuel = 1;
    this.refueling = false;
    this.lowFuelWarned = false;
    this.bullets = [];
    this.entities = [];
    this.generatedTo = this.checkpoint - 1;
    this.updateWorld(0);
    this.events.push({ type: 'respawn' });
  }

  private newGame(): void {
    this.score = 0;
    this.lives = START_LIVES;
    this.checkpoint = 0;
    this.nextExtraLife = EXTRA_LIFE_EVERY;
    this.respawn();
  }

  private setPhase(phase: Phase, event?: GameEvent): void {
    this.phase = phase;
    this.phaseTime = 0;
    if (event) this.events.push(event);
  }
}
