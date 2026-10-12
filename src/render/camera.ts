import * as THREE from 'three';
import type { Game } from '../game/game';
import { SPEED_CRUISE, SPEED_FAST, SPEED_SLOW } from '../game/tuning';
import { valueNoise } from '../world/noise';
import { SHIP_ALTITUDE } from './ship';

export const FOV = 50;
const CAM_HEIGHT = 64;
const CAM_BACK = 44;
const CAM_LOOK_AHEAD = 34;
/** How much the camera follows the player sideways (0 = fixed, 1 = locked). */
const CAM_FOLLOW_X = 0.6;

// Speed response: at full throttle the lens widens and the camera tucks in.
const FAST_FOV = 9;
const FAST_BACK = -4;
const FAST_HEIGHT = -4;
const SLOW_FOV = -3;

// Trauma shake: shake = trauma², trauma decays linearly.
const TRAUMA_DECAY = 1.3;
const SHAKE_OFFSET = 2.6;
const SHAKE_ROLL = 0.05;
const SHAKE_FREQ = 18;

const RESPAWN_TIME = 1.1;
const RESPAWN_RISE = 40;

// Game-over camera: drops in close and sways slowly around the wreck.
const WRECK_HEIGHT = 30;
const WRECK_RADIUS = 34;
const WRECK_SWAY = 0.45;
const WRECK_SWAY_RATE = 0.22;

const smooth = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** The chase camera and everything that moves it. */
export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 1, 700);
  private camX = 0;
  private throttle = 0;
  private trauma = 0;
  private time = 0;
  private respawnAge = Infinity;
  private wreck = 0;
  private wreckTime = 0;
  private readonly wreckAt = new THREE.Vector3();
  private readonly chasePos = new THREE.Vector3();
  private readonly chaseLook = new THREE.Vector3();
  private readonly look = new THREE.Vector3();

  /** 0 at cruise speed, 1 at full throttle, -1 at the slowest. */
  get speedFactor(): number {
    return this.throttle;
  }

  /** Forward distance from the camera to the point it looks at on the water. */
  get lookDistance(): number {
    return this.camera.position.z - this.look.z;
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  crashed(x: number, y: number): void {
    this.wreckAt.set(x, SHIP_ALTITUDE, -y);
  }

  respawned(game: Game): void {
    this.respawnAge = 0;
    this.wreck = 0;
    this.camX = game.x * CAM_FOLLOW_X;
  }

  /** `dt` is game time (slowed or frozen with the action); `realDt` drives the shake. */
  update(game: Game, x: number, y: number, dt: number, realDt: number): void {
    this.time += realDt;
    this.respawnAge += realDt;

    const target =
      game.speed >= SPEED_CRUISE
        ? (game.speed - SPEED_CRUISE) / (SPEED_FAST - SPEED_CRUISE)
        : (game.speed - SPEED_CRUISE) / (SPEED_CRUISE - SPEED_SLOW);
    this.throttle += (target - this.throttle) * smooth(3, dt);
    const fast = Math.max(this.throttle, 0);
    const slow = Math.max(-this.throttle, 0);

    // Respawn: start high and settle in.
    const k = 1 - THREE.MathUtils.smootherstep(this.respawnAge, 0, RESPAWN_TIME);
    const height = CAM_HEIGHT + FAST_HEIGHT * fast + RESPAWN_RISE * k * k;
    const back = CAM_BACK + FAST_BACK * fast + 10 * k;

    this.camX += (x * CAM_FOLLOW_X - this.camX) * smooth(4, dt);
    this.chasePos.set(this.camX, height, -y + back);
    this.chaseLook.set(this.camX, 0, -y - CAM_LOOK_AHEAD);

    // The final crash hands over to a slow orbit around the wreck.
    const over = (game.phase === 'crashed' && game.lives === 0) || game.phase === 'gameover';
    this.wreck += ((over ? 1 : 0) - this.wreck) * smooth(1.1, realDt);
    const w = THREE.MathUtils.smootherstep(this.wreck, 0, 1);
    this.wreckTime = over ? this.wreckTime + realDt : 0;
    const pos = this.camera.position.copy(this.chasePos);
    this.look.copy(this.chaseLook);
    if (w > 0.001) {
      const a = WRECK_SWAY * Math.sin(this.wreckTime * WRECK_SWAY_RATE);
      pos.lerp(
        this.wreckAt.clone().add(new THREE.Vector3(Math.sin(a) * WRECK_RADIUS, WRECK_HEIGHT, Math.cos(a) * WRECK_RADIUS)),
        w,
      );
      this.look.lerp(this.wreckAt, w);
    }

    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * realDt);
    const shake = this.trauma * this.trauma;
    const n = (seed: number) => valueNoise(seed, this.time * SHAKE_FREQ);
    pos.x += SHAKE_OFFSET * shake * n(11);
    pos.z += SHAKE_OFFSET * shake * n(23);
    this.look.x += SHAKE_OFFSET * shake * n(11) * 0.6;

    this.camera.lookAt(this.look);
    this.camera.rotateZ(SHAKE_ROLL * shake * n(37));
    this.camera.fov = FOV + FAST_FOV * fast + SLOW_FOV * slow;
    this.camera.updateProjectionMatrix();
  }
}
