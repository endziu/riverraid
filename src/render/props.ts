import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BANK_HEIGHT, River, SECTION_LEN } from '../world/river';
import { sectionProps, type Prop } from '../world/props';
import { commonGlsl, worldUniforms } from './materials';
import { themeColor } from './palette';

const BEHIND = 80;
const AHEAD = 260;
const H = BANK_HEIGHT;

const vertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vColor;
  void main() {
    #ifdef USE_COLOR
      vColor = color;
    #else
      vColor = vec3(0.0);
    #endif
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

function propMaterial(body: string, vertexColors: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: worldUniforms,
    vertexShader: vertex,
    fragmentShader: `${commonGlsl}\nvarying vec3 vColor;\nvoid main() {\n${body}\n}`,
    vertexColors,
    polygonOffset: !vertexColors,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

const hullMaterial = propMaterial(`gl_FragColor = vec4(vec3(0.004, 0.006, 0.014) * distFade(), 1.0);`, false);
const edgeMaterial = propMaterial(`gl_FragColor = vec4(vColor * distFade(), 1.0);`, true);
/** Warning lights blink out of step with each other. */
const lightMaterial = propMaterial(
  /* glsl */ `
  float phase = fract(sin(dot(floor(vWorld.xz), vec2(12.9898, 78.233))) * 43758.5453);
  float on = 0.25 + 0.75 * smoothstep(0.55, 0.6, fract(uTime * 0.6 + phase));
  gl_FragColor = vec4(vColor * on * distFade(), 1.0);
`,
  true,
);

/** Collects geometry for one sector's props into three merged meshes. */
class PropBuilder {
  readonly hulls: THREE.BufferGeometry[] = [];
  readonly edges: THREE.BufferGeometry[] = [];
  readonly lights: THREE.BufferGeometry[] = [];
  private readonly lines: number[] = [];
  private readonly lineColors: number[] = [];
  private readonly edgeColor: THREE.Color;
  private readonly lightColor: THREE.Color;

  constructor(edgeColor: THREE.Color, lightColor: THREE.Color) {
    this.edgeColor = edgeColor;
    this.lightColor = lightColor;
  }

  solid(geometry: THREE.BufferGeometry, x: number, y: number, z: number, edgeScale = 1): void {
    geometry.translate(x, y, z);
    const edges = new THREE.EdgesGeometry(geometry);
    paint(edges, this.edgeColor, edgeScale);
    this.edges.push(edges);
    this.hulls.push(strip(geometry));
  }

  light(x: number, y: number, z: number, size = 0.45): void {
    const g = strip(new THREE.BoxGeometry(size, size, size).translate(x, y, z));
    paint(g, this.lightColor);
    this.lights.push(g);
  }

  line(a: THREE.Vector3, b: THREE.Vector3, scale: number): void {
    this.lines.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const c = this.edgeColor;
    this.lineColors.push(c.r * scale, c.g * scale, c.b * scale, c.r * scale, c.g * scale, c.b * scale);
  }

  build(): THREE.Group {
    const group = new THREE.Group();
    if (this.lines.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.lines, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.lineColors, 3));
      this.edges.push(g);
    }
    if (this.hulls.length) group.add(new THREE.Mesh(mergeGeometries(this.hulls), hullMaterial));
    if (this.edges.length) group.add(new THREE.LineSegments(mergeGeometries(this.edges), edgeMaterial));
    if (this.lights.length) group.add(new THREE.Mesh(mergeGeometries(this.lights), lightMaterial));
    for (const g of [...this.hulls, ...this.edges, ...this.lights]) g.dispose();
    return group;
  }
}

/** Keep position only, so geometries of different shapes merge. */
function strip(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}

function paint(g: THREE.BufferGeometry, color: THREE.Color, scale = 1): void {
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([color.r * scale, color.g * scale, color.b * scale], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function addProp(b: PropBuilder, p: Prop): void {
  const z = -p.y;
  switch (p.kind) {
    case 'tower': {
      b.solid(new THREE.BoxGeometry(p.size * 2, p.height, p.size * 2), p.x, H + p.height / 2, z);
      b.solid(new THREE.BoxGeometry(p.size * 2.6, 0.3, p.size * 2.6), p.x, H + p.height * 0.7, z, 0.6);
      b.line(new THREE.Vector3(p.x, H + p.height, z), new THREE.Vector3(p.x, H + p.height + 3, z), 0.8);
      b.light(p.x, H + p.height + 3.2, z);
      break;
    }
    case 'block': {
      const d = p.size * 1.4;
      b.solid(new THREE.BoxGeometry(p.size * 2, p.height, d), p.x, H + p.height / 2, z, 0.7);
      // A lit band of windows along the long sides.
      b.solid(new THREE.BoxGeometry(p.size * 2 + 0.02, 0.12, d + 0.02), p.x, H + p.height * 0.62, z, 1.3);
      break;
    }
    case 'beacon': {
      b.solid(new THREE.ConeGeometry(p.size, p.height, 4).rotateY(Math.PI / 4), p.x, H + p.height / 2, z, 1.1);
      b.light(p.x, H + p.height + 0.4, z, 0.6);
      break;
    }
    case 'pylon': {
      b.solid(new THREE.CylinderGeometry(0.2, p.size, p.height, 4).rotateY(Math.PI / 4), p.x, H + p.height / 2, z, 0.8);
      b.solid(new THREE.BoxGeometry(4.5, 0.2, 0.2), p.x, H + p.height - 1.2, z, 0.8);
      b.light(p.x, H + p.height + 0.3, z, 0.35);
      break;
    }
  }
}

/** Sagging cables between consecutive pylons of a chain. */
function addCables(b: PropBuilder, props: Prop[]): void {
  for (let i = 1; i < props.length; i++) {
    const a = props[i - 1];
    const c = props[i];
    if (a.kind !== 'pylon' || c.kind !== 'pylon' || a.chain !== c.chain) continue;
    for (const dx of [-2.1, 2.1]) {
      const y = H + a.height - 1.1;
      const from = new THREE.Vector3(a.x + dx, y, -a.y);
      const to = new THREE.Vector3(c.x + dx, y, -c.y);
      let prev = from;
      for (let s = 1; s <= 6; s++) {
        const t = s / 6;
        const next = from.clone().lerp(to, t);
        next.y -= Math.sin(t * Math.PI) * 2.2;
        b.line(prev, next, 0.45);
        prev = next;
      }
    }
  }
}

function buildSection(river: River, section: number): THREE.Group {
  const color = themeColor(river.seed, section);
  const edge = color.clone().multiplyScalar(0.9).addScalar(0.12).multiplyScalar(1.4);
  const light = color.clone().addScalar(0.45).multiplyScalar(2.2);
  const b = new PropBuilder(edge, light);
  const props = sectionProps(river, section);
  for (const p of props) addProp(b, p);
  addCables(b, props);
  return b.build();
}

/** Streams each sector's bank structures in ahead of the player. */
export class PropsView {
  readonly group = new THREE.Group();
  private readonly river: River;
  private readonly sections = new Map<number, THREE.Group>();

  constructor(river: River) {
    this.river = river;
  }

  update(playerY: number): void {
    const first = Math.max(Math.floor((playerY - BEHIND) / SECTION_LEN), 0);
    const last = Math.floor((playerY + AHEAD) / SECTION_LEN);
    for (const [index, g] of this.sections) {
      if (index >= first && index <= last) continue;
      this.group.remove(g);
      g.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
      });
      this.sections.delete(index);
    }
    for (let index = first; index <= last; index++) {
      if (this.sections.has(index)) continue;
      const g = buildSection(this.river, index);
      this.sections.set(index, g);
      this.group.add(g);
    }
  }
}
