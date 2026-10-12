/** Gameplay tuning. Distances in world units, times in seconds. */

export const STEP = 1 / 60;

// Player flight
export const SPEED_SLOW = 18;
export const SPEED_CRUISE = 32;
export const SPEED_FAST = 56;
export const SPEED_ACCEL = 45;
export const MAX_LATERAL = 28;
export const LATERAL_ACCEL = 160;
/** Body box used against enemies and pickups. Banks use the finer HITBOX in game.ts. */
export const PLAYER_HALF_W = 1.2;
export const PLAYER_HALF_L = 1.4;

// Weapon
export const FIRE_COOLDOWN = 0.16;
/** Bullet speed on top of the plane's speed when fired. */
export const BULLET_SPEED = 120;
export const BULLET_RANGE = 130;
export const BULLET_HALF_W = 0.2;
export const BULLET_HALF_L = 1.3;

// Fuel (1 = full tank)
export const FUEL_DRAIN = 1 / 32;
export const REFUEL_RATE = 0.45;
export const LOW_FUEL = 0.25;

// Lives
export const START_LIVES = 3;
export const MAX_LIVES = 9;
export const EXTRA_LIFE_EVERY = 10_000;

// Flow
export const CRASH_TIME = 1.6;
/** Freeze after a crash or a bridge kill (about 3 frames at 60 Hz). */
export const HIT_STOP = 0.05;
/** Time scale at the start of the final crash; eases back to 1 as it plays out. */
export const SLOWMO_SCALE = 0.25;
export const GAME_OVER_DELAY = 1.0;
/** Sections are generated this far ahead of the player. */
export const SPAWN_AHEAD = 300;
/** Entities this far behind the player are dropped. */
export const CULL_BEHIND = 40;
