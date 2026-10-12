import * as THREE from 'three';

const COUNT = 160;
const DURATION = 1.4;
const DRAG = 2.2;
const GRAVITY = 14;
const POOL_SIZE = 10;

/** Burst of glowing sparks, re-triggered on each spawn. */
class Explosion {
  readonly points: THREE.Points;
  private readonly positions = new Float32Array(COUNT * 3);
  private readonly velocities = new Float32Array(COUNT * 3);
  private readonly material: THREE.ShaderMaterial;
  private age = Infinity;
  private duration = DURATION;

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color() },
        uLife: { value: 0 },
        uSize: { value: 0.7 },
        uScale: { value: 1000 },
      },
      vertexShader: /* glsl */ `
        uniform float uSize;
        uniform float uScale;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uLife;
        void main() {
          float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
          gl_FragColor = vec4(uColor * a * uLife, 1.0);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  setScale(scale: number): void {
    this.material.uniforms.uScale.value = scale;
  }

  /** `power` ~1 for a normal explosion; smaller for sparks, larger for big blasts. */
  spawn(at: THREE.Vector3, color: THREE.Color, power: number, density: number): void {
    const count = Math.max(1, Math.min(COUNT, Math.round(COUNT * Math.min(power, 1) * density)));
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3().randomDirection();
      dir.y = Math.abs(dir.y) * 0.8 + 0.2;
      dir.multiplyScalar((6 + Math.random() * 26) * Math.sqrt(power));
      this.positions.set([at.x, at.y, at.z], i * 3);
      this.velocities.set([dir.x, dir.y, dir.z], i * 3);
    }
    this.material.uniforms.uColor.value.copy(color);
    this.material.uniforms.uSize.value = 0.5 + 0.25 * power;
    this.duration = DURATION * Math.min(0.4 + 0.6 * power, 1.6);
    this.age = 0;
    this.points.geometry.setDrawRange(0, count);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.visible = true;
  }

  update(dt: number): void {
    if (!this.points.visible) return;
    this.age += dt;
    if (this.age >= this.duration) {
      this.points.visible = false;
      return;
    }
    const drag = Math.exp(-DRAG * dt);
    for (let i = 0; i < COUNT * 3; i += 3) {
      this.velocities[i] *= drag;
      this.velocities[i + 1] = this.velocities[i + 1] * drag - GRAVITY * dt;
      this.velocities[i + 2] *= drag;
      this.positions[i] += this.velocities[i] * dt;
      this.positions[i + 1] = Math.max(this.positions[i + 1] + this.velocities[i + 1] * dt, 0.1);
      this.positions[i + 2] += this.velocities[i + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.material.uniforms.uLife.value = Math.pow(1 - this.age / this.duration, 2);
  }
}

/** Round-robin pool of explosions. */
export class Explosions {
  readonly group = new THREE.Group();
  private readonly pool = Array.from({ length: POOL_SIZE }, () => new Explosion());
  private next = 0;
  /** Scales spark counts (quality preset). */
  density = 1;

  constructor() {
    this.pool.forEach((e) => this.group.add(e.points));
  }

  setScale(scale: number): void {
    this.pool.forEach((e) => e.setScale(scale));
  }

  spawn(at: THREE.Vector3, color: THREE.Color, power = 1): void {
    this.pool[this.next++ % POOL_SIZE].spawn(at, color, power, this.density);
  }

  update(dt: number): void {
    this.pool.forEach((e) => e.update(dt));
  }
}
