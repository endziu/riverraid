import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/700.css';
import './style.css';
import { GameAudio } from './audio/audio';
import { Game, type InputState } from './game/game';
import { STEP } from './game/tuning';
import { Keyboard } from './input/keyboard';
import { View } from './render/view';
import { Hud } from './ui/hud';

const SEED = 1982;

const game = new Game(SEED);
const keyboard = new Keyboard();
const view = new View(document.querySelector<HTMLCanvasElement>('#game')!, game);
const hud = new Hud(document.querySelector<HTMLElement>('#hud')!);
const audio = new GameAudio();

// Hold input until sounds are decoded so the first launch has its music.
const NO_INPUT: InputState = { left: false, right: false, up: false, down: false, fire: false };
let loading = true;
void audio.load().finally(() => (loading = false));

if (import.meta.env.DEV) {
  // Handy for poking at state from the browser console during development.
  Object.assign(window, { game, view, audio });
  void import('./audio/debug').then((m) => m.mountAudioDebug(audio));
}

// Fixed-timestep simulation, interpolated rendering.
let last = performance.now();
let acc = 0;

function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  acc += dt;
  while (acc >= STEP) {
    game.step(STEP, loading ? NO_INPUT : keyboard.state);
    acc -= STEP;
  }
  const events = game.drainEvents();
  view.render(game, acc / STEP, dt, events);
  audio.update(game, events);
  hud.update(game, { loading, muted: audio.engine.muted });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
