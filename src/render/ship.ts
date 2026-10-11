import * as THREE from 'three';
import { Trail } from './trail';

export const SHIP_ALTITUDE = 4.5;

const HULL_COLOR = new THREE.Color(0.01, 0.015, 0.025);
const EDGE_COLOR = new THREE.Color(2.2, 2.3, 2.6);
const ENGINE_COLOR = new THREE.Color(0.6, 1.8, 2.6);
const TRAIL_COLOR = new THREE.Color(0.35, 0.85, 1.4);
const WINGTIPS = [new THREE.Vector3(-1.35, 0.15, 1.0), new THREE.Vector3(1.35, 0.15, 1.0)];

/** The player's delta-wing craft plus its wingtip light trails. */
export class Ship {
  readonly group = new THREE.Group();
  readonly trails = WINGTIPS.map(() => new Trail(TRAIL_COLOR, 0.35));
  private readonly tmp = new THREE.Vector3();

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
    const engine = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.12, 0.12),
      new THREE.MeshBasicMaterial({ color: ENGINE_COLOR, toneMapped: false }),
    );
    engine.position.set(0, 0.15, 0.85);
    this.group.add(body, edges, engine);
  }

  /** Place the ship at logic coords (x, y) with a bank amount in [-1, 1]. */
  update(x: number, y: number, bank: number): void {
    this.group.position.set(x, SHIP_ALTITUDE, -y);
    this.group.rotation.set(0, -bank * 0.15, -bank * 0.6);
    this.group.updateMatrixWorld();
    this.trails.forEach((trail, i) => trail.update(this.tmp.copy(WINGTIPS[i]).applyMatrix4(this.group.matrixWorld)));
  }

  reset(): void {
    this.trails.forEach((t) => t.clear());
  }
}
