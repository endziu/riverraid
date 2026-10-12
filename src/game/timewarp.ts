import type { Game, GameEvent } from './game';
import { CRASH_TIME, HIT_STOP, SLOWMO_SCALE } from './tuning';

type Clocked = Pick<Game, 'phase' | 'phaseTime' | 'lives'>;

/**
 * Game-feel time control over the fixed-step loop: a short hit-stop freeze on
 * big impacts, and slow motion through the crash that ends the game.
 */
export class TimeWarp {
  private freeze = 0;

  /** Arm effects for the events of the frame that just ran. */
  react(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'crash' || (e.type === 'destroyed' && e.kind === 'bridge' && e.points > 0)) {
        this.freeze = HIT_STOP;
      }
    }
  }

  /** Turn a real frame time into simulation time. */
  advance(dt: number, game: Clocked): number {
    // The epsilon keeps float leftovers from costing an extra frame.
    if (this.freeze > 1e-6) {
      this.freeze -= dt;
      return 0;
    }
    return dt * timeScale(game);
  }
}

/** 1 normally; slowed during the final crash, easing back to 1 as it ends. */
export function timeScale(game: Clocked): number {
  if (game.phase !== 'crashed' || game.lives > 0) return 1;
  const t = Math.min(game.phaseTime / CRASH_TIME, 1);
  return SLOWMO_SCALE + (1 - SLOWMO_SCALE) * t * t;
}
