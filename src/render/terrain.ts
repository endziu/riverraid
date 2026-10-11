import * as THREE from 'three';
import { BANK_HEIGHT, River, SECTION_LEN, type RiverSlice } from '../world/river';
import { bankEdgeMaterial, landTopMaterial, roadMaterial, wallMaterial, waterlineMaterial } from './materials';

const CHUNK_LEN = 64;
const ROW_STEP = 2;
const ROWS = CHUNK_LEN / ROW_STEP + 1;
const LAND_OUTER = 260;
const BEHIND = 80;
const AHEAD = 260;
const EDGE_WIDTH = 0.3;
const WATERLINE_HEIGHT = 0.35;
const ROAD_HALF_WIDTH = 1.6;
const ROAD_LINE = 0.25;

type Vec3 = readonly [number, number, number];

/** Accumulates quad strips (two rails, one quad per row) into a single geometry. */
class StripBuilder {
  private pos: number[] = [];
  private idx: number[] = [];

  add(n: number, a: (i: number) => Vec3, b: (i: number) => Vec3): void {
    const base = this.pos.length / 3;
    for (let i = 0; i < n; i++) this.pos.push(...a(i), ...b(i));
    for (let i = 0; i < n - 1; i++) {
      const v = base + i * 2;
      this.idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setIndex(this.idx);
    return g;
  }
}

interface Row extends RiverSlice {
  z: number;
  /** Island top height; islands rise out of the water as they widen. */
  islandHeight: number;
}

function buildChunk(river: River, index: number): THREE.Group {
  const rows: Row[] = [];
  for (let i = 0; i < ROWS; i++) {
    const y = index * CHUNK_LEN + i * ROW_STEP;
    const s = river.sample(y);
    rows.push({ ...s, z: -y, islandHeight: BANK_HEIGHT * Math.min(s.islandHalf / 2, 1) });
  }
  const H = BANK_HEIGHT;
  const L = (r: Row) => r.center - r.halfWidth;
  const R = (r: Row) => r.center + r.halfWidth;
  const IL = (r: Row) => r.center - r.islandHalf;
  const IR = (r: Row) => r.center + r.islandHalf;
  const ew = (r: Row) => Math.min(EDGE_WIDTH, r.islandHalf);
  const wl = (r: Row) => Math.min(WATERLINE_HEIGHT, r.islandHeight);
  const lift = 0.02;

  const top = new StripBuilder();
  top.add(ROWS, (i) => [-LAND_OUTER, H, rows[i].z], (i) => [L(rows[i]), H, rows[i].z]);
  top.add(ROWS, (i) => [R(rows[i]), H, rows[i].z], (i) => [LAND_OUTER, H, rows[i].z]);
  top.add(ROWS, (i) => [IL(rows[i]), rows[i].islandHeight, rows[i].z], (i) => [IR(rows[i]), rows[i].islandHeight, rows[i].z]);

  const walls = new StripBuilder();
  walls.add(ROWS, (i) => [L(rows[i]), 0, rows[i].z], (i) => [L(rows[i]), H, rows[i].z]);
  walls.add(ROWS, (i) => [R(rows[i]), 0, rows[i].z], (i) => [R(rows[i]), H, rows[i].z]);
  walls.add(ROWS, (i) => [IL(rows[i]), 0, rows[i].z], (i) => [IL(rows[i]), rows[i].islandHeight, rows[i].z]);
  walls.add(ROWS, (i) => [IR(rows[i]), 0, rows[i].z], (i) => [IR(rows[i]), rows[i].islandHeight, rows[i].z]);

  const edges = new StripBuilder();
  edges.add(ROWS, (i) => [L(rows[i]) - EDGE_WIDTH, H + lift, rows[i].z], (i) => [L(rows[i]), H + lift, rows[i].z]);
  edges.add(ROWS, (i) => [R(rows[i]), H + lift, rows[i].z], (i) => [R(rows[i]) + EDGE_WIDTH, H + lift, rows[i].z]);
  edges.add(
    ROWS,
    (i) => [IL(rows[i]), rows[i].islandHeight + lift, rows[i].z],
    (i) => [IL(rows[i]) + ew(rows[i]), rows[i].islandHeight + lift, rows[i].z],
  );
  edges.add(
    ROWS,
    (i) => [IR(rows[i]) - ew(rows[i]), rows[i].islandHeight + lift, rows[i].z],
    (i) => [IR(rows[i]), rows[i].islandHeight + lift, rows[i].z],
  );

  const waterline = new StripBuilder();
  waterline.add(ROWS, (i) => [L(rows[i]) + lift, 0, rows[i].z], (i) => [L(rows[i]) + lift, WATERLINE_HEIGHT, rows[i].z]);
  waterline.add(ROWS, (i) => [R(rows[i]) - lift, 0, rows[i].z], (i) => [R(rows[i]) - lift, WATERLINE_HEIGHT, rows[i].z]);
  waterline.add(ROWS, (i) => [IL(rows[i]) - lift, 0, rows[i].z], (i) => [IL(rows[i]) - lift, wl(rows[i]), rows[i].z]);
  waterline.add(ROWS, (i) => [IR(rows[i]) + lift, 0, rows[i].z], (i) => [IR(rows[i]) + lift, wl(rows[i]), rows[i].z]);

  // Glowing road lines leading to each bridge.
  const roads = new StripBuilder();
  const y0 = index * CHUNK_LEN;
  for (let by = Math.ceil(y0 / SECTION_LEN) * SECTION_LEN; by < y0 + CHUNK_LEN; by += SECTION_LEN) {
    if (by === 0) continue;
    const s = river.sample(by);
    const spans: [number, number][] = [
      [-LAND_OUTER, s.center - s.halfWidth],
      [s.center + s.halfWidth, LAND_OUTER],
    ];
    for (const z of [-by - ROAD_HALF_WIDTH, -by + ROAD_HALF_WIDTH]) {
      for (const span of spans) {
        roads.add(2, (i) => [span[i], H + lift, z], (i) => [span[i], H + lift, z - ROAD_LINE]);
      }
    }
  }

  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(top.build(), landTopMaterial),
    new THREE.Mesh(walls.build(), wallMaterial),
    new THREE.Mesh(edges.build(), bankEdgeMaterial),
    new THREE.Mesh(waterline.build(), waterlineMaterial),
    new THREE.Mesh(roads.build(), roadMaterial),
  );
  return group;
}

/** Streams river chunks in ahead of the player and disposes them behind. */
export class Terrain {
  readonly group = new THREE.Group();
  private readonly river: River;
  private readonly chunks = new Map<number, THREE.Group>();

  constructor(river: River) {
    this.river = river;
  }

  update(playerY: number): void {
    const first = Math.floor((playerY - BEHIND) / CHUNK_LEN);
    const last = Math.floor((playerY + AHEAD) / CHUNK_LEN);

    for (const [index, chunk] of this.chunks) {
      if (index >= first && index <= last) continue;
      this.group.remove(chunk);
      chunk.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      this.chunks.delete(index);
    }
    for (let index = first; index <= last; index++) {
      if (this.chunks.has(index)) continue;
      const chunk = buildChunk(this.river, index);
      this.chunks.set(index, chunk);
      this.group.add(chunk);
    }
  }
}
