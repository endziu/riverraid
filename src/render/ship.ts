import * as THREE from 'three';
import { Trail } from './trail';

export const SHIP_ALTITUDE = 4.5;

const HULL_COLOR = new THREE.Color(0.01, 0.015, 0.025);
const EDGE_COLOR = new THREE.Color(2.2, 2.3, 2.6);
const CANOPY_COLOR = new THREE.Color(0.04, 0.16, 0.28);
const CANOPY_EDGE = new THREE.Color(0.8, 2.0, 3.0);
const ENGINE_COLOR = new THREE.Color(0.6, 1.8, 2.6);
const FLAME_COLOR = new THREE.Color(0.25, 0.7, 1.6);
const FLAME_CORE = new THREE.Color(1.6, 2.2, 2.6);
const FLASH_COLOR = new THREE.Color(2.4, 2.8, 3.2);
const TRAIL_COLOR = new THREE.Color(0.35, 0.85, 1.4);
const WINGTIPS = [new THREE.Vector3(-1.35, 0.15, 1.0), new THREE.Vector3(1.35, 0.15, 1.0)];
const ENGINE_POS = new THREE.Vector3(0, 0.15, 0.85);
const NOSE_POS = new THREE.Vector3(0, 0.2, -2.25);
const FLASH_TIME = 0.06;

const additive = (color: THREE.Color) =>
  new THREE.MeshBasicMaterial({
    color,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });

/** The player's delta-wing craft, its engine flame, muzzle flash and wingtip light trails. */
export class Ship {
  readonly group = new THREE.Group();
  readonly trails = WINGTIPS.map(() => new Trail(TRAIL_COLOR, 0.35));
  private readonly tmp = new THREE.Vector3();
  private readonly flame = new THREE.Group();
  private readonly flash = new THREE.Group();
  private flashAge = Infinity;
  private time = 0;

  constructor() {
    const shape = new THREE.Shape([
      new THREE.Vector2(0, 2),
      new THREE.Vector2(1.4, -1.0),
      new THREE.Vector2(0.4, -0.7),
      new THREE.Vector2(0, -0.9),
      new THREE.Vector2(-0.4, -0.7),
      new THREE.Vector2(-1.4, -1.0),
    ]);
    const hull = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
    hull.rotateX(-Math.PI / 2); // shape +y → forward (-z), extrusion → up

    const body = new THREE.Mesh(hull, new THREE.MeshBasicMaterial({ color: HULL_COLOR }));
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(hull),
      new THREE.LineBasicMaterial({ color: EDGE_COLOR, toneMapped: false }),
    );

    // Faceted canopy and a dorsal spine running back to the engine.
    const canopyGeometry = new THREE.OctahedronGeometry(0.5).scale(0.55, 0.45, 1.5).translate(0, 0.36, -0.15);
    const canopy = new THREE.Mesh(canopyGeometry, new THREE.MeshBasicMaterial({ color: CANOPY_COLOR }));
    const canopyEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(canopyGeometry),
      new THREE.LineBasicMaterial({ color: CANOPY_EDGE, toneMapped: false }),
    );
    const spine = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.32, 0.6), new THREE.Vector3(0, 0.32, 0.85)]),
      new THREE.LineBasicMaterial({ color: EDGE_COLOR, toneMapped: false }),
    );

    const engine = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.12, 0.12),
      new THREE.MeshBasicMaterial({ color: ENGINE_COLOR, toneMapped: false }),
    );
    engine.position.copy(ENGINE_POS);

    // Flame cones point backwards from the engine; length follows speed.
    const cone = (radius: number) => new THREE.ConeGeometry(radius, 1, 12, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    this.flame.add(new THREE.Mesh(cone(0.26), additive(FLAME_COLOR)), new THREE.Mesh(cone(0.12), additive(FLAME_CORE)));
    this.flame.position.copy(ENGINE_POS).add(new THREE.Vector3(0, 0, 0.08));

    // Muzzle flash: two crossed flat blades at the nose.
    const blade = new THREE.PlaneGeometry(0.35, 1.6).rotateX(-Math.PI / 2);
    const a = new THREE.Mesh(blade, additive(FLASH_COLOR));
    const b = new THREE.Mesh(blade, a.material);
    b.rotation.y = Math.PI / 2;
    b.scale.set(1, 1, 0.5);
    this.flash.add(a, b);
    this.flash.position.copy(NOSE_POS);
    this.flash.visible = false;

    this.group.add(body, edges, canopy, canopyEdges, spine, engine, this.flame, this.flash);
  }

  /** Called on each shot. */
  fire(): void {
    this.flashAge = 0;
    this.flash.rotation.y = (Math.random() - 0.5) * 0.6;
  }

  /**
   * Place the ship at logic coords (x, y) with a bank amount in [-1, 1].
   * `throttle` is 0 at the slowest speed and 1 at full.
   */
  update(x: number, y: number, bank: number, throttle: number, dt: number): void {
    this.time += dt;
    this.group.position.set(x, SHIP_ALTITUDE, -y);
    this.group.rotation.set(0, -bank * 0.15, -bank * 0.6);

    const flicker = 0.85 + 0.15 * Math.sin(this.time * 61) + 0.1 * Math.sin(this.time * 37);
    this.flame.scale.set(1 + 0.15 * flicker * throttle, 1, (0.5 + 2.4 * throttle) * flicker);

    this.flashAge += dt;
    this.flash.visible = this.flashAge < FLASH_TIME;
    if (this.flash.visible) this.flash.scale.setScalar(1.3 - this.flashAge / FLASH_TIME + Math.random() * 0.3);

    this.group.updateMatrixWorld();
    this.trails.forEach((trail, i) => trail.update(this.tmp.copy(WINGTIPS[i]).applyMatrix4(this.group.matrixWorld)));
  }

  reset(): void {
    this.trails.forEach((t) => t.clear());
  }
}
