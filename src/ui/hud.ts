import { SPEED_FAST, SPEED_SLOW, type Game } from '../game/game';

/** DOM overlay: distance, speed and centre-screen messages. */
export class Hud {
  private readonly distance: HTMLElement;
  private readonly speedFill: HTMLElement;
  private readonly message: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="hud-top">
        <div class="hud-stat"><span class="label">DIST</span><span class="value" data-distance>0</span></div>
        <div class="hud-stat"><span class="label">SPEED</span><div class="bar"><div class="bar-fill" data-speed></div></div></div>
      </div>
      <div class="hud-message" data-message></div>
    `;
    this.distance = root.querySelector('[data-distance]')!;
    this.speedFill = root.querySelector('[data-speed]')!;
    this.message = root.querySelector('[data-message]')!;
  }

  update(game: Game): void {
    this.distance.textContent = String(Math.floor(game.y)).padStart(6, '0');
    const speed = (game.speed - SPEED_SLOW) / (SPEED_FAST - SPEED_SLOW);
    this.speedFill.style.transform = `scaleX(${0.08 + speed * 0.92})`;

    const text =
      game.phase === 'ready'
        ? 'PRESS SPACE TO LAUNCH'
        : game.phase === 'crashed'
          ? 'SIGNAL LOST — PRESS SPACE'
          : '';
    if (this.message.textContent !== text) this.message.textContent = text;
  }
}
