import { describe, expect, it } from 'vitest';
import { Game, SPEED_CRUISE, SPEED_FAST, STEP, type InputState } from './game';

const idle: InputState = { left: false, right: false, up: false, down: false, fire: false };
const press = (overrides: Partial<InputState>): InputState => ({ ...idle, ...overrides });

function launched(): Game {
  const game = new Game(1982);
  game.step(STEP, press({ fire: true }));
  game.step(STEP, idle);
  return game;
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
    const game = launched();
    const y0 = game.y;
    for (let i = 0; i < 60; i++) game.step(STEP, idle);
    expect(game.y - y0).toBeCloseTo(SPEED_CRUISE, 0);
  });

  it('accelerates when holding up', () => {
    const game = launched();
    for (let i = 0; i < 120; i++) game.step(STEP, press({ up: true }));
    expect(game.speed).toBe(SPEED_FAST);
  });

  it('crashes into the bank when steering hard', () => {
    const game = launched();
    game.drainEvents();
    for (let i = 0; i < 300 && game.phase === 'playing'; i++) game.step(STEP, press({ right: true }));
    expect(game.phase).toBe('crashed');
    expect(game.drainEvents()[0]).toMatchObject({ type: 'crash' });
  });

  it('restarts from the beginning after a crash', () => {
    const game = launched();
    for (let i = 0; i < 300 && game.phase === 'playing'; i++) game.step(STEP, press({ right: true }));
    for (let i = 0; i < 60; i++) game.step(STEP, idle);
    game.drainEvents();
    game.step(STEP, press({ fire: true }));
    expect(game.phase).toBe('playing');
    expect(game.x).toBe(0);
    expect(game.y).toBe(0);
    expect(game.drainEvents()).toEqual([{ type: 'reset' }, { type: 'launch' }]);
  });
});
