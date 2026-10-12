import * as THREE from 'three';

const POOL = 10;
const DURATION = 0.45;
const ring = new THREE.RingGeometry(0.88, 1, 40).rotateX(-Math.PI / 2);

/** Expanding rings that flag an enemy as it starts to move. */
export class Pulses {
  readonly group = new THREE.Group();
  private readonly rings: { mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; age: number; color: THREE.Color }[] = [];
  private next = 0;

  constructor() {
    for (let i = 0; i < POOL; i++) {
      const material = new THREE.MeshBasicMaterial({
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(ring, material);
      mesh.visible = false;
      this.rings.push({ mesh, age: Infinity, color: new THREE.Color() });
      this.group.add(mesh);
    }
  }

  spawn(at: THREE.Vector3, color: THREE.Color, radius: number): void {
    const r = this.rings[this.next++ % POOL];
    r.age = 0;
    r.color.copy(color);
    r.mesh.position.copy(at);
    r.mesh.userData.radius = radius;
    r.mesh.visible = true;
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const t = r.age / DURATION;
      if (t >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const s = r.mesh.userData.radius * (0.6 + 1.6 * (1 - (1 - t) ** 3));
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.color.copy(r.color).multiplyScalar((1 - t) ** 2);
    }
  }
}
