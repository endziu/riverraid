import * as THREE from 'three';

const MAX_POINTS = 40;
const SPACING = 0.6;

/** A tapering, fading light ribbon that follows a moving point. */
export class Trail {
  readonly mesh: THREE.Mesh;
  private readonly points: THREE.Vector3[] = [];
  private readonly positions = new Float32Array(MAX_POINTS * 2 * 3);
  private readonly colors = new Float32Array(MAX_POINTS * 2 * 3);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly color: THREE.Color;
  private readonly width: number;

  constructor(color: THREE.Color, width: number) {
    this.color = color;
    this.width = width;
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const idx: number[] = [];
    for (let i = 0; i < MAX_POINTS - 1; i++) {
      const v = i * 2;
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
    this.geometry.setIndex(idx);
    this.geometry.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(
      this.geometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.mesh.frustumCulled = false;
  }

  clear(): void {
    this.points.length = 0;
    this.geometry.setDrawRange(0, 0);
  }

  /** Move the head of the trail to `head` (world space). */
  update(head: THREE.Vector3): void {
    const pts = this.points;
    if (pts.length < 2 || pts[1].distanceTo(head) > SPACING) {
      pts.unshift(head.clone());
      if (pts.length > MAX_POINTS) pts.pop();
    } else {
      pts[0].copy(head);
    }
    if (pts.length < 2) return;

    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(i - 1, 0)];
      const b = pts[Math.min(i + 1, pts.length - 1)];
      let dx = a.x - b.x;
      let dz = a.z - b.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;

      const t = i / (MAX_POINTS - 1);
      const half = (this.width * (1 - t)) / 2;
      const fade = Math.pow(1 - t, 1.5);
      const p = pts[i];
      const o = i * 6;
      this.positions.set([p.x - dz * half, p.y, p.z + dx * half, p.x + dz * half, p.y, p.z - dx * half], o);
      const r = this.color.r * fade;
      const g = this.color.g * fade;
      const bl = this.color.b * fade;
      this.colors.set([r, g, bl, r, g, bl], o);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.setDrawRange(0, (pts.length - 1) * 6);
  }
}
