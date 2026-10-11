import * as THREE from 'three';
import { BRIDGE_OVERHANG, type Entity, type EntityKind } from '../game/entities';
import { BANK_HEIGHT } from '../world/river';
import { barrierMaterial } from './materials';

/** Glow colours; values above 1 feed the bloom pass. */
export const COLORS = {
  player: new THREE.Color(1.2, 2.2, 3.0),
  enemy: new THREE.Color(1.0, 0.35, 0.06).multiplyScalar(3.5),
  jet: new THREE.Color(1.0, 0.12, 0.45).multiplyScalar(3.5),
  fuel: new THREE.Color(0.35, 1.0, 0.45).multiplyScalar(2.2),
  bridge: new THREE.Color(1.0, 0.62, 0.12).multiplyScalar(2.5),
} as const;

export const KIND_COLOR: Record<EntityKind, THREE.Color> = {
  ship: COLORS.enemy,
  heli: COLORS.enemy,
  jet: COLORS.jet,
  fuel: COLORS.fuel,
  bridge: COLORS.bridge,
};

/** Height above the water each kind is drawn at. */
export const ALTITUDE: Record<EntityKind, number> = { ship: 0, heli: 4, jet: 5.5, fuel: 0, bridge: 0 };

const hullMaterial = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0.01, 0.01, 0.018),
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

const lineMaterials = new Map<THREE.Color, THREE.LineBasicMaterial>();
function lineMaterial(color: THREE.Color): THREE.LineBasicMaterial {
  let m = lineMaterials.get(color);
  if (!m) {
    m = new THREE.LineBasicMaterial({ color, toneMapped: false });
    lineMaterials.set(color, m);
  }
  return m;
}

const glowMaterials = new Map<THREE.Color, THREE.MeshBasicMaterial>();
function glowMaterial(color: THREE.Color): THREE.MeshBasicMaterial {
  let m = glowMaterials.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: color.clone(), toneMapped: false });
    glowMaterials.set(color, m);
  }
  return m;
}

/** Dark solid with glowing edges. */
function glowSolid(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geometry, hullMaterial), new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lineMaterial(color)));
  return g;
}

/** Top-down outline (x right, y forward) extruded upwards by `depth`. */
function flatShape(points: [number, number][], depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).rotateX(-Math.PI / 2);
}

function shipModel(): THREE.Object3D {
  const g = new THREE.Group();
  const hull = flatShape(
    [[2.6, 0], [1.8, 0.9], [-2.2, 0.9], [-2.4, 0.5], [-2.4, -0.5], [-2.2, -0.9], [1.8, -0.9]],
    0.7,
  );
  g.add(glowSolid(hull, COLORS.enemy), glowSolid(new THREE.BoxGeometry(1.4, 0.8, 1.1).translate(-0.6, 1.1, 0), COLORS.enemy));
  return g;
}

function heliModel(): THREE.Object3D {
  const g = new THREE.Group();
  g.add(
    glowSolid(new THREE.BoxGeometry(1.8, 0.9, 1.1), COLORS.enemy),
    glowSolid(new THREE.BoxGeometry(1.8, 0.22, 0.22).translate(-1.7, 0.15, 0), COLORS.enemy),
    glowSolid(new THREE.BoxGeometry(0.15, 0.7, 0.1).translate(-2.55, 0.4, 0), COLORS.enemy),
  );
  const rotor = new THREE.Group();
  rotor.name = 'rotor';
  rotor.position.y = 0.7;
  const blade = new THREE.BoxGeometry(4.4, 0.04, 0.14);
  const a = new THREE.Mesh(blade, glowMaterial(COLORS.enemy));
  const b = new THREE.Mesh(blade, glowMaterial(COLORS.enemy));
  b.rotation.y = Math.PI / 2;
  rotor.add(a, b);
  g.add(rotor);
  return g;
}

function jetModel(): THREE.Object3D {
  return glowSolid(
    flatShape([[2.2, 0], [-1.2, 1.5], [-0.6, 0.35], [-1.0, 0], [-0.6, -0.35], [-1.2, -1.5]], 0.3),
    COLORS.jet,
  );
}

/** Shared by all depots so they pulse together. */
export const fuelStripeMaterial = new THREE.MeshBasicMaterial({ color: COLORS.fuel.clone(), toneMapped: false });

function fuelModel(): THREE.Object3D {
  const g = glowSolid(new THREE.BoxGeometry(3, 1.6, 5).translate(0, 0.8, 0), COLORS.fuel);
  const stripe = new THREE.BoxGeometry(3.02, 0.06, 0.4);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(stripe, fuelStripeMaterial);
    m.position.set(0, 1.62, -1.8 + i * 1.2);
    g.add(m);
  }
  return g;
}

const TOWER = 6;

/** Bridges differ in width, so each is built individually (and disposed). */
function bridgeModel(e: Entity): THREE.Object3D {
  const halfWater = e.halfW - BRIDGE_OVERHANG;
  const width = e.halfW * 2;
  const g = new THREE.Group();
  g.add(
    glowSolid(new THREE.BoxGeometry(width, 0.6, 3).translate(0, BANK_HEIGHT, 0), COLORS.bridge),
    glowSolid(new THREE.BoxGeometry(width, 0.4, 0.6).translate(0, BANK_HEIGHT + TOWER, 0), COLORS.bridge),
  );
  for (const side of [-1, 1]) {
    g.add(glowSolid(new THREE.BoxGeometry(0.8, TOWER, 0.8).translate(side * (halfWater + 1), BANK_HEIGHT + TOWER / 2, 0), COLORS.bridge));
  }
  const barrierHeight = BANK_HEIGHT + TOWER;
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(halfWater * 2, barrierHeight).translate(0, barrierHeight / 2, 0), barrierMaterial));
  g.userData.disposable = true;
  return g;
}

const templates: Partial<Record<Exclude<EntityKind, 'bridge'>, THREE.Object3D>> = {};
const builders = { ship: shipModel, heli: heliModel, jet: jetModel, fuel: fuelModel };

export function createModel(e: Entity): THREE.Object3D {
  if (e.kind === 'bridge') return bridgeModel(e);
  const template = (templates[e.kind] ??= builders[e.kind]());
  return template.clone();
}

export function disposeModel(obj: THREE.Object3D): void {
  if (!obj.userData.disposable) return;
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
  });
}
