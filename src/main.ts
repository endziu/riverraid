import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/700.css';
import './style.css';
import { Game } from './game/game';
import { STEP } from './game/tuning';
import { Keyboard } from './input/keyboard';
import { View } from './render/view';
import { Hud } from './ui/hud';

const SEED = 1982;

const game = new Game(SEED);
const keyboard = new Keyboard();
const view = new View(document.querySelector<HTMLCanvasElement>('#game')!, game);
const hud = new Hud(document.querySelector<HTMLElement>('#hud')!);

// Handy for poking at state from the browser console during development.
if (import.meta.env.DEV) Object.assign(window, { game, view });

// Fixed-timestep simulation, interpolated rendering.
let last = performance.now();
let acc = 0;

function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  acc += dt;
  while (acc >= STEP) {
    game.step(STEP, keyboard.state);
    acc -= STEP;
  }
  view.render(game, acc / STEP, dt, game.drainEvents());
  hud.update(game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
