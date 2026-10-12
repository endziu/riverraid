import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { Game, GameEvent } from '../game/game';
import { CRASH_TIME } from '../game/tuning';
import { BridgeCollapses } from './bridge';
import { CameraRig } from './camera';
import { Debris } from './debris';
import { EntityView } from './entities';
import { Explosions } from './explosion';
import { createFinishPass } from './finish';
import { Horizon } from './horizon';
import { worldUniforms } from './materials';
import { ALTITUDE, COLORS, KIND_COLOR, disposeModel } from './models';
import { Overlay } from './overlay';
import { updatePalette } from './palette';
import { PropsView } from './props';
import { Pulses } from './pulses';
import type { GraphicsSettings } from './quality';
import { SHIP_ALTITUDE, Ship } from './ship';
import { SpeedLines } from './speedlines';
import { Terrain } from './terrain';
import { Water } from './water';

const BACKGROUND = new THREE.Color(0, 0, 0.004);
/** Forward distance from the camera to the horizon wall; the world fades out just before it. */
const HORIZON = 150;
const FADE_LENGTH = 42;
const SPLASH_COLOR = new THREE.Color(0.7, 1.4, 2.2);
const RESPAWN_FADE = 0.6;
const CRASH_FADE = 0.45;

/** Camera trauma and chromatic aberration kick per event. */
const IMPACT = {
  crash: { trauma: 0.95, aberration: 1 },
  bridge: { trauma: 0.7, aberration: 0.75 },
  jet: { trauma: 0.35, aberration: 0.2 },
  kill: { trauma: 0.22, aberration: 0 },
} as const;

/** Owns the Three.js scene and draws the current game state. */
export class View {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly finish: ShaderPass;
  private readonly scene = new THREE.Scene();
  private readonly fog: THREE.Fog;
  private readonly rig = new CameraRig();
  private readonly terrain: Terrain;
  private readonly props: PropsView;
  private readonly horizon = new Horizon();
  private readonly water: Water;
  private readonly ship = new Ship();
  private readonly pulses = new Pulses();
  private readonly entities = new EntityView(this.pulses);
  private readonly explosions = new Explosions();
  private readonly debris = new Debris();
  private readonly speedLines = new SpeedLines();
  private readonly collapses: BridgeCollapses;
  private readonly overlay: Overlay;
  private readonly settings: GraphicsSettings;
  private aberration = 0;
  private respawnAge = Infinity;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement, game: Game, settings: GraphicsSettings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.scene.background = BACKGROUND;
    this.fog = new THREE.Fog(BACKGROUND, 100, 150);
    this.scene.fog = this.fog;

    const camera = this.rig.camera;
    this.terrain = new Terrain(game.river);
    this.props = new PropsView(game.river);
    this.water = new Water(camera);
    camera.layers.enable(1);
    this.collapses = new BridgeCollapses(
      (at) => {
        this.explosions.spawn(at, SPLASH_COLOR, 0.35);
        this.debris.spawn(at, SPLASH_COLOR, 4, 0.6);
      },
      disposeModel,
    );
    this.overlay = new Overlay(overlay);
    this.scene.add(
      this.terrain.group,
      this.props.group,
      this.horizon.mesh,
      this.water.group,
      this.ship.group,
      this.entities.group,
      this.collapses.group,
      this.pulses.group,
      this.explosions.group,
      this.debris.mesh,
      this.speedLines.mesh,
    );
    this.ship.trails.forEach((t) => this.scene.add(t.mesh));

    this.composer = new EffectComposer(this.renderer);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.35, 0.9);
    this.finish = createFinishPass();
    this.composer.addPass(new RenderPass(this.scene, camera));
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.finish);

    this.applySettings();
    window.addEventListener('resize', () => this.applySettings());
    // Open on the same swoop-in as a respawn.
    this.rig.respawned(game);
    this.respawnAge = 0;
  }

  toast(text: string): void {
    this.overlay.toast(text);
  }

  /** `dt` is game time (slowed or frozen by the time warp); `realDt` is wall-clock frame time. */
  render(game: Game, alpha: number, dt: number, realDt: number, events: GameEvent[]): void {
    for (const e of events) this.handle(e, game);

    const x = game.prevX + (game.x - game.prevX) * alpha;
    const y = game.prevY + (game.y - game.prevY) * alpha;
    const time = (worldUniforms.uTime.value += dt);

    this.rig.update(game, x, y, dt, realDt);
    const camera = this.rig.camera;
    this.updateDistances();
    updatePalette(game.river.seed, y);

    this.terrain.update(y);
    this.props.update(y);
    this.ship.group.visible = game.phase === 'ready' || game.phase === 'playing';
    if (this.ship.group.visible) this.ship.update(x, y, game.bank, (this.rig.speedFactor + 1) / 2, dt);
    this.entities.sync(game, alpha, time, dt);
    this.collapses.update(dt, y);
    this.pulses.update(dt);
    this.explosions.update(dt);
    this.debris.update(dt);
    const full = game.phase === 'playing' ? THREE.MathUtils.smoothstep(this.rig.speedFactor, 0.7, 1) : 0;
    this.speedLines.update(dt, camera.position.x, -y, game.speed, full);
    this.water.update(camera.position.x, -y - 60);
    this.horizon.update(camera.position.x, camera.position.z, HORIZON);
    this.overlay.update(game, camera, dt, realDt);

    this.respawnAge += realDt;
    this.aberration *= Math.exp(-realDt * 6);
    const u = this.finish.uniforms;
    u.uTime.value += realDt;
    u.uAberration.value = this.aberration;
    u.uScanlines.value = this.settings.scanlines ? 0.22 : 0;
    u.uFade.value = this.fade(game);
    this.explosions.setScale(this.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));

    this.composer.render(dt);
  }

  /** Re-read the graphics settings (quality preset, scanlines) and the window size. */
  applySettings(): void {
    const preset = this.settings.preset;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, preset.pixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.setSize(Math.round(w * dpr * preset.bloom), Math.round(h * dpr * preset.bloom));
    this.water.setQuality(preset.reflection, w * dpr, h * dpr);
    this.explosions.density = preset.particles;
    this.debris.density = preset.particles;
    this.rig.camera.aspect = w / h;
    this.rig.camera.updateProjectionMatrix();
  }

  /** Fade the world out just before the horizon wall, in shaders and in fog. */
  private updateDistances(): void {
    const far = HORIZON - 3;
    const near = far - FADE_LENGTH;
    worldUniforms.uFadeNear.value = near;
    worldUniforms.uFadeFar.value = far;
    // Fog works on view depth; convert from forward distance along the ground.
    const cam = this.rig.camera;
    const pitch = Math.atan2(cam.position.y, this.rig.lookDistance);
    const depth = (d: number) => d * Math.cos(pitch) + cam.position.y * Math.sin(pitch);
    this.fog.near = depth(near);
    this.fog.far = depth(far);
  }

  /** Screen brightness: dips to black at the end of a crash and fades back in on respawn. */
  private fade(game: Game): number {
    const fadeIn = THREE.MathUtils.smoothstep(this.respawnAge, 0, RESPAWN_FADE);
    const fadeOut =
      game.phase === 'crashed' && game.lives > 0
        ? 1 - THREE.MathUtils.smoothstep(game.phaseTime, CRASH_TIME - CRASH_FADE, CRASH_TIME)
        : 1;
    return Math.min(fadeIn, fadeOut);
  }

  private kick(impact: (typeof IMPACT)[keyof typeof IMPACT]): void {
    this.rig.addTrauma(impact.trauma);
    this.aberration = Math.max(this.aberration, impact.aberration);
  }

  private handle(e: GameEvent, game: Game): void {
    switch (e.type) {
      case 'shot':
        this.ship.fire();
        break;
      case 'crash': {
        const at = new THREE.Vector3(e.x, SHIP_ALTITUDE, -e.y);
        this.explosions.spawn(at, COLORS.player, 1.4);
        this.debris.spawn(at, COLORS.player, 28, 1.3);
        this.kick(IMPACT.crash);
        this.rig.crashed(e.x, e.y);
        this.ship.reset();
        break;
      }
      case 'destroyed': {
        const color = KIND_COLOR[e.kind];
        const at = new THREE.Vector3(e.x, ALTITUDE[e.kind] + 1, -e.y);
        if (e.kind === 'bridge') {
          const model = this.entities.detach(e.id);
          if (model) this.collapses.start(model);
          this.explosions.spawn(at, color, 1.6);
          const span = game.river.sample(e.y).halfWidth;
          for (const dx of [-0.6, -0.2, 0.2, 0.6]) {
            this.debris.spawn(at.clone().setX(e.x + dx * span), color, 9, 1.1);
          }
          this.kick(IMPACT.bridge);
        } else {
          this.explosions.spawn(at, color, 1);
          this.debris.spawn(at, color, e.kind === 'fuel' ? 16 : 12, e.kind === 'fuel' ? 1.2 : 0.9);
          this.kick(e.kind === 'jet' || e.kind === 'fuel' ? IMPACT.jet : IMPACT.kill);
        }
        if (e.points > 0) {
          this.overlay.popup(at.setY(at.y + (e.kind === 'bridge' ? 9 : 3)), `+${e.points}`, e.kind === 'bridge' ? 'big' : e.kind);
        }
        break;
      }
      case 'impact':
        this.explosions.spawn(new THREE.Vector3(e.x, SHIP_ALTITUDE, -e.y), COLORS.player, 0.2);
        break;
      case 'extraLife':
        this.overlay.popup(new THREE.Vector3(game.x, SHIP_ALTITUDE + 3, -game.y - 6), '1UP', 'life');
        break;
      case 'respawn':
        this.ship.reset();
        this.collapses.clear();
        this.overlay.clearPopups();
        this.rig.respawned(game);
        this.respawnAge = 0;
        break;
    }
  }
}
