import * as THREE from 'three';
import { BRIDGE_OVERHANG, type Entity } from '../game/entities';
import { BANK_HEIGHT, SECTION_LEN } from '../world/river';
import { barrierMaterial, roadLightMaterial } from './materials';
import { COLORS, glowSolid } from './models';

const H = BANK_HEIGHT;
const TOWER = 6;
const DECK_DEPTH = 3;
const DECK_TOP = 0.3;
const LABEL_DEPTH = 2.1;
const LAMP_HALF = 0.2;

// Collapse motion.
const HINGE_ACCEL = 6;
const HINGE_BREAK = 0.95;
const TOWER_ACCEL = 4.5;
const GRAVITY = 30;
const SINK_DEPTH = -14;

/** Bridges differ in width and number, so each is built individually (and disposed). */
export function bridgeModel(e: Entity): THREE.Object3D {
  const hw = e.halfW - BRIDGE_OVERHANG;
  const deck = (width: number) => new THREE.BoxGeometry(width, 0.6, DECK_DEPTH);
  const g = new THREE.Group();
  const label = labelTexture(`SECTOR ${String(Math.round(e.y / SECTION_LEN) + 1).padStart(2, '0')}`);
  const labelWidth = hw * 1.7;

  for (const side of [-1, 1]) {
    g.add(glowSolid(deck(BRIDGE_OVERHANG).translate(side * (hw + BRIDGE_OVERHANG / 2), H, 0), COLORS.bridge));

    // Each half of the span hinges on its bank and carries half of the painted number.
    const half = new THREE.Group();
    half.name = 'half';
    half.userData.side = side;
    half.userData.length = hw;
    half.position.set(side * hw, H, 0);
    half.add(glowSolid(deck(hw).translate((-side * hw) / 2, 0, 0), COLORS.bridge));
    const paint = new THREE.PlaneGeometry(labelWidth / 2, LABEL_DEPTH).rotateX(-Math.PI / 2);
    const uv = paint.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + (side > 0 ? 0.5 : 0));
    const labelMesh = new THREE.Mesh(paint, label.material);
    labelMesh.position.set(-side * (hw - labelWidth / 4), DECK_TOP + 0.03, 0);
    labelMesh.userData.ownsMaterial = side > 0;
    half.add(labelMesh, deckLamps(side, hw));
    g.add(half);

    const tower = new THREE.Group();
    tower.name = 'tower';
    tower.userData.side = side;
    tower.position.set(side * (hw + 1), H, 0);
    tower.add(glowSolid(new THREE.BoxGeometry(0.8, TOWER, 0.8).translate(0, TOWER / 2, 0), COLORS.bridge));
    g.add(tower);
  }

  const beam = glowSolid(new THREE.BoxGeometry(e.halfW * 2, 0.4, 0.6), COLORS.bridge);
  beam.name = 'beam';
  beam.position.y = H + TOWER;
  const barrierHeight = H + TOWER;
  const barrier = new THREE.Mesh(
    new THREE.PlaneGeometry(hw * 2, barrierHeight).translate(0, barrierHeight / 2, 0),
    barrierMaterial,
  );
  barrier.name = 'barrier';
  g.add(beam, barrier);
  g.userData.disposable = true;
  return g;
}

/** Lamps along both deck edges, continuing the road lamps' chase towards the middle. */
function deckLamps(side: number, hw: number): THREE.Mesh {
  const pos: number[] = [];
  const phase: number[] = [];
  const idx: number[] = [];
  const h = LAMP_HALF;
  for (let d = 1; d < hw; d += 2.5) {
    for (const z of [-DECK_DEPTH / 2 + 0.25, DECK_DEPTH / 2 - 0.25]) {
      const x = -side * d;
      const v = pos.length / 3;
      pos.push(x - h, DECK_TOP + 0.04, z - h, x + h, DECK_TOP + 0.04, z - h, x - h, DECK_TOP + 0.04, z + h, x + h, DECK_TOP + 0.04, z + h);
      phase.push(-d, -d, -d, -d);
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
  geometry.setIndex(idx);
  return new THREE.Mesh(geometry, roadLightMaterial);
}

const FONT = '700 44px Orbitron';

/** Glowing text painted on a deck. Redraws once the web font has loaded. */
function labelTexture(text: string): { material: THREE.MeshBasicMaterial } {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  const draw = () => {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '10px';
    ctx.fillStyle = '#fff';
    ctx.fillText(text, canvas.width / 2 + 5, canvas.height / 2 + 2);
    texture.needsUpdate = true;
  };
  draw();
  if (!document.fonts.check(FONT)) void document.fonts.load(FONT).then(draw);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: COLORS.bridge.clone().multiplyScalar(0.7),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  return { material };
}

interface Piece {
  obj: THREE.Object3D;
  kind: 'half' | 'tower' | 'beam';
  side: number;
  delay: number;
  angle: number;
  spin: number;
  vy: number;
  falling: boolean;
  splashed: boolean;
}

const tip = new THREE.Vector3();

/** One bridge coming apart: halves swing down off their hinges, towers topple, all sink. */
class Collapse {
  readonly model: THREE.Object3D;
  private readonly pieces: Piece[] = [];
  private readonly onSplash: (at: THREE.Vector3) => void;

  constructor(model: THREE.Object3D, onSplash: (at: THREE.Vector3) => void) {
    this.model = model;
    this.onSplash = onSplash;
    model.getObjectByName('barrier')!.visible = false;
    model.traverse((o) => {
      if (o.name !== 'half' && o.name !== 'tower' && o.name !== 'beam') return;
      const kind = o.name as Piece['kind'];
      this.pieces.push({
        obj: o,
        kind,
        side: o.userData.side ?? 0,
        delay: kind === 'half' ? Math.random() * 0.06 : kind === 'tower' ? 0.1 + Math.random() * 0.1 : 0.04,
        angle: 0,
        spin: (Math.random() - 0.5) * 1.5,
        vy: kind === 'beam' ? 2 : 0,
        falling: kind === 'beam',
        splashed: false,
      });
    });
  }

  /** Returns true once every moving piece has sunk. */
  update(dt: number): boolean {
    let done = true;
    for (const p of this.pieces) {
      if (!p.obj.visible) continue;
      done = false;
      p.delay -= dt;
      if (p.delay > 0) continue;

      if (!p.falling) {
        const accel = p.kind === 'half' ? HINGE_ACCEL : TOWER_ACCEL * (0.4 + p.angle);
        p.spin += accel * dt;
        p.angle += p.spin * dt;
        if (p.angle > (p.kind === 'half' ? HINGE_BREAK : Math.PI / 2)) p.falling = true;
      } else {
        p.vy -= GRAVITY * dt;
        p.obj.position.y += p.vy * dt;
        p.angle += p.spin * 0.3 * dt;
        if (p.kind === 'beam') p.obj.rotation.x += p.spin * dt * 0.4;
        if (p.obj.position.y < SINK_DEPTH) p.obj.visible = false;
      }
      if (p.kind !== 'beam') p.obj.rotation.z = p.side * p.angle;

      if (!p.splashed) {
        p.obj.updateWorldMatrix(true, false);
        const reach = p.kind === 'half' ? -p.side * p.obj.userData.length : 0;
        tip.set(reach, p.kind === 'tower' ? TOWER : 0, 0);
        p.obj.localToWorld(tip);
        if (tip.y < 0.2) {
          p.splashed = true;
          this.onSplash(tip.clone());
        }
      }
    }
    return done;
  }
}

/** Runs bridge collapses until the wreckage is behind the camera. */
export class BridgeCollapses {
  readonly group = new THREE.Group();
  private readonly active: Collapse[] = [];
  private readonly onSplash: (at: THREE.Vector3) => void;
  private readonly dispose: (obj: THREE.Object3D) => void;

  constructor(onSplash: (at: THREE.Vector3) => void, dispose: (obj: THREE.Object3D) => void) {
    this.onSplash = onSplash;
    this.dispose = dispose;
  }

  start(model: THREE.Object3D): void {
    this.group.add(model);
    this.active.push(new Collapse(model, this.onSplash));
  }

  update(dt: number, playerY: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i];
      const sunk = c.update(dt);
      if (sunk && -c.model.position.z < playerY - 60) this.remove(i);
    }
  }

  clear(): void {
    while (this.active.length) this.remove(this.active.length - 1);
  }

  private remove(i: number): void {
    const [c] = this.active.splice(i, 1);
    this.group.remove(c.model);
    this.dispose(c.model);
  }
}
