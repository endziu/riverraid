import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/700.css';
import './style.css';
import { GameAudio } from './audio/audio';
import { Game, type InputState } from './game/game';
import { TimeWarp } from './game/timewarp';
import { STEP } from './game/tuning';
import { Keyboard } from './input/keyboard';
import { GraphicsSettings } from './render/quality';
import { View } from './render/view';
import { Hud } from './ui/hud';

const SEED = 1982;

const game = new Game(SEED);
const keyboard = new Keyboard();
const settings = new GraphicsSettings();
const view = new View(
  document.querySelector<HTMLCanvasElement>('#game')!,
  document.querySelector<HTMLElement>('#overlay')!,
  game,
  settings,
);
const hud = new Hud(document.querySelector<HTMLElement>('#hud')!);
const audio = new GameAudio();
const warp = new TimeWarp();

// Hold input until sounds are decoded so the first launch has its music.
const NO_INPUT: InputState = { left: false, right: false, up: false, down: false, fire: false };
let loading = true;
void audio.load().finally(() => (loading = false));

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyQ') {
    view.toast(`QUALITY ${settings.cycleQuality().toUpperCase()}`);
    view.applySettings();
  } else if (e.code === 'KeyC') {
    view.toast(`SCANLINES ${settings.toggleScanlines() ? 'ON' : 'OFF'}`);
  }
});

if (import.meta.env.DEV) {
  // Handy for poking at state from the browser console during development.
  Object.assign(window, { game, view, audio });
  void import('./audio/debug').then((m) => m.mountAudioDebug(audio));
}

// Fixed-timestep simulation, interpolated rendering. The time warp stretches
// game time for hit-stop and slow motion.
let last = performance.now();
let acc = 0;

function frame(now: number) {
  const real = Math.min((now - last) / 1000, 0.1);
  last = now;
  const dt = warp.advance(real, game);
  acc += dt;
  while (acc >= STEP) {
    game.step(STEP, loading ? NO_INPUT : keyboard.state);
    acc -= STEP;
  }
  const events = game.drainEvents();
  warp.react(events);
  view.render(game, acc / STEP, dt, real, events);
  audio.update(game, events);
  hud.update(game, { loading, muted: audio.engine.muted });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
