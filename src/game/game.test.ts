import { describe, expect, it } from 'vitest';
import { SECTION_LEN } from '../world/river';
import type { Entity, EntityKind } from './entities';
import { Game, type GameEvent, type InputState } from './game';
import { CRASH_TIME, FUEL_DRAIN, SPEED_CRUISE, SPEED_FAST, START_LIVES, STEP } from './tuning';

const idle: InputState = { left: false, right: false, up: false, down: false, fire: false };
const press = (overrides: Partial<InputState>): InputState => ({ ...idle, ...overrides });

function launched(): Game {
  const game = new Game(1982);
  game.step(STEP, press({ fire: true }));
  game.step(STEP, idle);
  game.drainEvents();
  return game;
}

/** A launched game with every generated entity cleared, for controlled scenarios. */
function emptyRiver(): Game {
  const game = launched();
  game.entities = [];
  return game;
}

function place(game: Game, kind: EntityKind, dx: number, dy: number, halfW = 2, halfL = 1): Entity {
  const e: Entity = {
    id: 9999 + game.entities.length,
    kind,
    x: game.x + dx,
    y: game.y + dy,
    prevX: game.x + dx,
    vx: 0,
    halfW,
    halfL,
    activateAt: Infinity,
    active: false,
  };
  game.entities.push(e);
  return e;
}

function run(game: Game, seconds: number, input: InputState = idle): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds; t += STEP) {
    game.step(STEP, input);
    events.push(...game.drainEvents());
  }
  return events;
}

function crash(game: Game): void {
  for (let i = 0; i < 600 && game.phase === 'playing'; i++) game.step(STEP, press({ right: true }));
  expect(game.phase).toBe('crashed');
}

describe('Game', () => {
  it('waits for fire before launching', () => {
    const game = new Game(1982);
    game.step(STEP, idle);
    expect(game.phase).toBe('ready');
    game.step(STEP, press({ fire: true }));
    expect(game.phase).toBe('playing');
    expect(game.drainEvents()).toEqual([{ type: 'launch' }]);
  });

  it('flies forward at cruise speed', () => {
    const game = emptyRiver();
    const y0 = game.y;
    run(game, 1);
    expect(game.y - y0).toBeCloseTo(SPEED_CRUISE, 0);
  });

  it('accelerates when holding up', () => {
    const game = emptyRiver();
    run(game, 2, press({ up: true }));
    expect(game.speed).toBe(SPEED_FAST);
  });

  it('crashes into the bank when steering hard', () => {
    const game = emptyRiver();
    const events = run(game, 5, press({ right: true }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'crash', cause: 'terrain' }));
  });

  it('shoots enemies ahead for points', () => {
    const game = emptyRiver();
    place(game, 'heli', 0, 30);
    const events = run(game, 0.5, press({ fire: true }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'shot' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'destroyed', kind: 'heli', points: 60 }));
    expect(game.score).toBe(60);
  });

  it('crashes into enemies in the way', () => {
    const game = emptyRiver();
    place(game, 'ship', 0, 10);
    const events = run(game, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'crash', cause: 'enemy' }));
  });

  it('drains fuel over time and refuels over a depot', () => {
    const game = emptyRiver();
    run(game, 2);
    expect(game.fuel).toBeCloseTo(1 - 2 * FUEL_DRAIN, 2);

    place(game, 'fuel', 0, 4, 1.5, 6);
    const events = run(game, 0.3);
    expect(events).toContainEqual({ type: 'refuelStart' });
    expect(game.fuel).toBeGreaterThan(1 - 2 * FUEL_DRAIN);
  });

  it('crashes when the tank runs dry', () => {
    const game = emptyRiver();
    game.fuel = 0.001;
    const events = run(game, 0.2);
    expect(events).toContainEqual(expect.objectContaining({ type: 'crash', cause: 'fuel' }));
  });

  it('respawns at the start with one life less', () => {
    const game = launched();
    crash(game);
    run(game, CRASH_TIME + STEP);
    expect(game.phase).toBe('ready');
    expect(game.lives).toBe(START_LIVES - 1);
    expect(game.y).toBe(0);
    expect(game.fuel).toBe(1);
  });

  it('makes a destroyed bridge the new checkpoint', () => {
    const game = emptyRiver();
    const bridge = place(game, 'bridge', 0, 30, 15, 1.5);
    bridge.y = SECTION_LEN;
    game.y = SECTION_LEN - 30;
    run(game, 0.5, press({ fire: true }));
    expect(game.checkpoint).toBe(1);
    expect(game.score).toBe(500);
  });

  it('ends the game after the last life and restarts on fire', () => {
    const game = launched();
    for (let i = 0; i < START_LIVES; i++) {
      crash(game);
      run(game, CRASH_TIME + STEP);
      if (game.phase === 'ready') game.step(STEP, press({ fire: true }));
      game.step(STEP, idle);
    }
    expect(game.phase).toBe('gameover');
    run(game, 1.1);
    game.step(STEP, press({ fire: true }));
    expect(game.phase).toBe('playing');
    expect(game.lives).toBe(START_LIVES);
    expect(game.score).toBe(0);
  });
});
