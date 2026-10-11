import type { InputState } from '../game/game';

const BINDINGS: Record<string, keyof InputState> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'fire',
  Enter: 'fire',
};

export class Keyboard {
  readonly state: InputState = { left: false, right: false, up: false, down: false, fire: false };

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => this.set(e, true));
    target.addEventListener('keyup', (e) => this.set(e, false));
    target.addEventListener('blur', () => {
      for (const k of Object.keys(this.state) as (keyof InputState)[]) this.state[k] = false;
    });
  }

  private set(e: KeyboardEvent, down: boolean): void {
    const action = BINDINGS[e.code];
    if (!action) return;
    e.preventDefault();
    this.state[action] = down;
  }
}
