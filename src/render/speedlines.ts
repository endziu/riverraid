import * as THREE from 'three';

const COUNT = 70;
const AHEAD = 150;
const BEHIND = 10;
const SPREAD = 55;
/** Extra drift towards the camera, so streaks rush past faster than the ground. */
const DRIFT = 70;
const COLOR = new THREE.Color(0.55, 0.85, 1.3);

/**
 * Streaks of light rushing past the camera at full throttle. Drawn on layer 1
 * so the water reflection ignores them.
 */
export class SpeedLines {
  readonly mesh: THREE.LineSegments;
  private readonly heads: THREE.Vector3[] = [];
  private readonly positions = new Float32Array(COUNT * 6);
  private readonly colors = new Float32Array(COUNT * 6);

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.mesh = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(1);
    for (let i = 0; i < COUNT; i++) this.heads.push(new THREE.Vector3(0, 0, Infinity));
  }

  /** `amount` 0..1 fades the effect in; `speed` sets streak length. */
  update(dt: number, camX: number, playerZ: number, speed: number, amount: number): void {
    this.mesh.visible = amount > 0.01;
    if (!this.mesh.visible) return;
    const len = speed * 0.22 + 4;
    for (let i = 0; i < COUNT; i++) {
      const h = this.heads[i];
      h.z += DRIFT * dt;
      if (h.z > playerZ + BEHIND || h.z < playerZ - AHEAD - 30 || Math.abs(h.x - camX) > SPREAD * 1.4) {
        h.set(camX + (Math.random() - 0.5) * 2 * SPREAD, 7 + Math.random() * 18, playerZ - AHEAD - Math.random() * 30);
      }
      const fadeIn = THREE.MathUtils.smoothstep(h.z, playerZ - AHEAD - 30, playerZ - AHEAD + 20);
      const k = amount * fadeIn * (0.5 + 0.5 * ((i * 7919) % 13) / 13);
      this.positions.set([h.x, h.y, h.z, h.x, h.y, h.z + len], i * 6);
      this.colors.set([COLOR.r * k, COLOR.g * k, COLOR.b * k, 0, 0, 0], i * 6);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}
