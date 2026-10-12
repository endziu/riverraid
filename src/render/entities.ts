import * as THREE from 'three';
import type { Game } from '../game/game';
import { ALTITUDE, COLORS, KIND_COLOR, createModel, disposeModel, fuelStripeMaterial } from './models';
import type { Pulses } from './pulses';
import { SHIP_ALTITUDE } from './ship';
import { Trail } from './trail';

const STREAK_TAIL = 7;
const STREAK_HEAD = 1.4;
/** The streak's tail never reaches back past the ship's nose. */
const NOSE = 2;
const TELEGRAPH_TIME = 0.35;
const WAKE_COLOR = new THREE.Color(0.25, 0.55, 0.8);
const STERN = 2.4;

/** A flat quad from the bullet's head (z = 0) back along +z; scaled in z to the streak length. */
const streakGeometry = new THREE.PlaneGeometry(0.55, 1).translate(0, 0.5, 0).rotateX(Math.PI / 2);
const streakMaterial = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: COLORS.player }, uHead: { value: 0.2 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uHead;
    varying vec2 vUv;
    void main() {
      // vUv.y is 0 at the head and 1 at the tail end.
      float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
      float core = smoothstep(0.0, 0.6, across);
      float tail = pow(1.0 - vUv.y, 2.2) * core;
      float head = smoothstep(uHead, 0.0, vUv.y) * smoothstep(0.2, 0.9, across);
      gl_FragColor = vec4(uColor * tail * 0.9 + vec3(2.5) * head, 1.0);
    }
  `,
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
});

/** Mirrors game entities and bullets as scene objects. */
export class EntityView {
  readonly group = new THREE.Group();
  private readonly models = new Map<number, THREE.Object3D>();
  private readonly wakes = new Map<number, Trail>();
  private readonly bullets: THREE.Mesh[] = [];
  private readonly pulses: Pulses;
  private readonly tmp = new THREE.Vector3();

  constructor(pulses: Pulses) {
    this.pulses = pulses;
  }

  sync(game: Game, alpha: number, time: number, dt: number): void {
    const seen = new Set<number>();
    for (const e of game.entities) {
      seen.add(e.id);
      let obj = this.models.get(e.id);
      if (!obj) {
        obj = createModel(e);
        obj.userData.active = e.active;
        obj.userData.telegraph = Infinity;
        this.models.set(e.id, obj);
        this.group.add(obj);
      }
      const x = e.prevX + (e.x - e.prevX) * alpha;
      obj.position.set(x, ALTITUDE[e.kind], -e.y);
      if (e.kind === 'heli') {
        obj.position.y += Math.sin(time * 3 + e.id) * 0.25;
        obj.getObjectByName('rotor')!.rotation.y = time * 25;
      }

      // Flag movers the moment they wake up: a ring on the water and a quick swell.
      if (e.active && !obj.userData.active && e.vx !== 0 && e.kind !== 'jet') {
        obj.userData.telegraph = 0;
        this.pulses.spawn(this.tmp.set(x, ALTITUDE[e.kind] + 0.1, -e.y), KIND_COLOR[e.kind], e.halfW + 1);
      }
      obj.userData.active = e.active;
      obj.userData.telegraph += dt;
      const t = obj.userData.telegraph / TELEGRAPH_TIME;
      const swell = t < 1 ? 1 + 0.35 * Math.sin(t * Math.PI) : 1;
      obj.scale.set((e.vx < 0 ? -1 : 1) * swell, swell, swell);

      if (e.kind === 'ship' && e.active && e.vx !== 0) this.wake(e.id).update(this.tmp.set(x - Math.sign(e.vx) * STERN, 0.05, -e.y));
    }
    for (const [id, obj] of this.models) {
      if (seen.has(id)) continue;
      this.group.remove(obj);
      disposeModel(obj);
      this.models.delete(id);
    }
    for (const [id, trail] of this.wakes) {
      if (seen.has(id)) continue;
      this.group.remove(trail.mesh);
      trail.dispose();
      this.wakes.delete(id);
    }

    fuelStripeMaterial.color.copy(COLORS.fuel).multiplyScalar(0.6 + 0.4 * Math.sin(time * 5));
    this.syncBullets(game, alpha);
  }

  /** Hand over an entity's model (for its death animation); the view forgets it. */
  detach(id: number): THREE.Object3D | undefined {
    const obj = this.models.get(id);
    if (!obj) return undefined;
    this.models.delete(id);
    this.group.remove(obj);
    return obj;
  }

  private wake(id: number): Trail {
    let trail = this.wakes.get(id);
    if (!trail) {
      trail = new Trail(WAKE_COLOR, 1.6, true);
      this.wakes.set(id, trail);
      this.group.add(trail.mesh);
    }
    return trail;
  }

  private syncBullets(game: Game, alpha: number): void {
    while (this.bullets.length < game.bullets.length) {
      const m = new THREE.Mesh(streakGeometry, streakMaterial);
      m.frustumCulled = false;
      this.bullets.push(m);
      this.group.add(m);
    }
    const playerY = game.prevY + (game.y - game.prevY) * alpha;
    this.bullets.forEach((m, i) => {
      const b = game.bullets[i];
      m.visible = !!b;
      if (!b) return;
      const y = b.prevY + (b.y - b.prevY) * alpha;
      m.position.set(b.x, SHIP_ALTITUDE, -y);
      m.scale.z = STREAK_HEAD + Math.min(STREAK_TAIL, Math.max(y - playerY - NOSE - STREAK_HEAD, 0));
    });
  }
}
