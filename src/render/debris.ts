import * as THREE from 'three';

const MAX = 360;
const GRAVITY = 22;
const DRAG = 1.2;
const VERTS = 6; // three edges per triangular shard

interface Shard {
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  axis: THREE.Vector3;
  angle: number;
  spin: number;
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  color: THREE.Color;
}

const q = new THREE.Quaternion();
const v = new THREE.Vector3();

/** Wireframe shards that tumble out of a kill, splash down and fade. One draw call. */
export class Debris {
  readonly mesh: THREE.LineSegments;
  private readonly shards: Shard[] = [];
  private readonly positions = new Float32Array(MAX * VERTS * 3);
  private readonly colors = new Float32Array(MAX * VERTS * 3);
  private next = 0;
  /** Scales shard counts (quality preset). */
  density = 1;

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
      }),
    );
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX; i++) {
      this.shards.push({
        life: 0,
        maxLife: 1,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        axis: new THREE.Vector3(0, 1, 0),
        angle: 0,
        spin: 0,
        corners: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
        color: new THREE.Color(),
      });
    }
  }

  /** Burst `count` shards from `at`; `size` scales both shard size and speed. */
  spawn(at: THREE.Vector3, color: THREE.Color, count: number, size = 1): void {
    const n = Math.max(1, Math.round(count * this.density));
    for (let i = 0; i < n; i++) {
      const s = this.shards[this.next++ % MAX];
      s.maxLife = s.life = 1.2 + Math.random() * 1.2;
      s.pos.copy(at).add(v.randomDirection().multiplyScalar(Math.random() * size));
      s.vel.randomDirection();
      s.vel.y = Math.abs(s.vel.y) * 1.2 + 0.4;
      s.vel.multiplyScalar((8 + Math.random() * 16) * Math.sqrt(size));
      s.axis.randomDirection();
      s.angle = Math.random() * Math.PI * 2;
      s.spin = (Math.random() - 0.5) * 18;
      const r = (0.35 + Math.random() * 0.7) * size;
      for (let c = 0; c < 3; c++) {
        const a = (c / 3) * Math.PI * 2 + (Math.random() - 0.5) * 1.2;
        s.corners[c].set(Math.cos(a) * r, (Math.random() - 0.5) * r * 0.6, Math.sin(a) * r);
      }
      s.color.copy(color);
    }
  }

  clear(): void {
    for (const s of this.shards) s.life = 0;
  }

  update(dt: number): void {
    const drag = Math.exp(-DRAG * dt);
    for (let i = 0; i < MAX; i++) {
      const s = this.shards[i];
      const o = i * VERTS * 3;
      if (s.life <= 0) {
        this.colors.fill(0, o, o + VERTS * 3);
        continue;
      }
      s.life -= dt;
      s.vel.multiplyScalar(drag);
      s.vel.y -= GRAVITY * dt;
      s.pos.addScaledVector(s.vel, dt);
      // Splashed down: drift on the surface, tumble slower and fade out faster.
      if (s.pos.y < 0.1) {
        s.pos.y = 0.1;
        s.vel.set(s.vel.x * 0.5, 0, s.vel.z * 0.5);
        s.spin *= 0.9;
        s.life -= dt * 2;
      }
      s.angle += s.spin * dt;
      q.setFromAxisAngle(s.axis, s.angle);

      const fade = Math.max(s.life / s.maxLife, 0) ** 1.5;
      const [r, g, b] = [s.color.r * fade, s.color.g * fade, s.color.b * fade];
      for (let e = 0; e < 3; e++) {
        for (let k = 0; k < 2; k++) {
          v.copy(s.corners[(e + k) % 3]).applyQuaternion(q).add(s.pos);
          const p = o + (e * 2 + k) * 3;
          this.positions[p] = v.x;
          this.positions[p + 1] = v.y;
          this.positions[p + 2] = v.z;
          this.colors[p] = r;
          this.colors[p + 1] = g;
          this.colors[p + 2] = b;
        }
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}
