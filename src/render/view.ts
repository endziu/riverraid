import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Game, GameEvent } from '../game/game';
import { Explosion } from './explosion';
import { waterMaterial, worldUniforms } from './materials';
import { SHIP_ALTITUDE, Ship } from './ship';
import { Terrain } from './terrain';

const FOV = 50;
const CAM_HEIGHT = 70;
const CAM_BACK = 30;
const CAM_LOOK_AHEAD = 20;
/** How much the camera follows the player sideways (0 = fixed, 1 = locked). */
const CAM_FOLLOW_X = 0.6;

/** Owns the Three.js scene and draws the current game state. */
export class View {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 1, 400);
  private readonly terrain: Terrain;
  private readonly water: THREE.Mesh;
  private readonly ship = new Ship();
  private readonly explosion = new Explosion(new THREE.Vector3(1.2, 2.2, 3.0));
  private camX = 0;
  private shake = 0;

  constructor(canvas: HTMLCanvasElement, game: Game) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.scene.background = new THREE.Color(0, 0, 0.004);

    this.terrain = new Terrain(game.river);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(800, 800).rotateX(-Math.PI / 2), waterMaterial);
    this.scene.add(this.terrain.group, this.water, this.ship.group, this.explosion.points);
    this.ship.trails.forEach((t) => this.scene.add(t.mesh));

    this.composer = new EffectComposer(this.renderer);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.35, 0.9);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  render(game: Game, alpha: number, dt: number, events: GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'crash') {
        this.explosion.spawn(new THREE.Vector3(e.x, SHIP_ALTITUDE, -e.y));
        this.shake = 1;
        this.ship.reset();
      } else if (e.type === 'reset') {
        this.ship.reset();
      }
    }

    const x = game.prevX + (game.x - game.prevX) * alpha;
    const y = game.prevY + (game.y - game.prevY) * alpha;

    worldUniforms.uTime.value += dt;
    this.terrain.update(y);
    this.ship.group.visible = game.phase !== 'crashed';
    if (this.ship.group.visible) this.ship.update(x, y, game.bank);
    this.explosion.update(dt);

    this.camX += (x * CAM_FOLLOW_X - this.camX) * (1 - Math.exp(-dt * 4));
    this.shake *= Math.exp(-dt * 5);
    const sx = (Math.random() - 0.5) * this.shake * 2.5;
    const sz = (Math.random() - 0.5) * this.shake * 2.5;
    this.camera.position.set(this.camX + sx, CAM_HEIGHT, -y + CAM_BACK + sz);
    this.camera.lookAt(this.camX + sx, 0, -y - CAM_LOOK_AHEAD + sz);
    this.water.position.set(this.camX, 0, -y - 60);

    this.composer.render(dt);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.explosion.setScale((h * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2))));
  }
}
