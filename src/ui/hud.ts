import type { Game } from '../game/game';
import { LOW_FUEL } from '../game/tuning';

const HI_SCORE_KEY = 'river.hiscore';

export interface HudStatus {
  loading: boolean;
  muted: boolean;
}

/** DOM overlay: score, sector, lives, fuel gauge and centre-screen messages. */
export class Hud {
  private readonly score: HTMLElement;
  private readonly hiScore: HTMLElement;
  private readonly sector: HTMLElement;
  private readonly lives: HTMLElement;
  private readonly fuelBox: HTMLElement;
  private readonly fuelFill: HTMLElement;
  private readonly message: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly muted: HTMLElement;
  private hi = Number(localStorage.getItem(HI_SCORE_KEY)) || 0;
  private shownLives = -1;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="hud-top">
        <div class="hud-stat"><span class="label">SCORE</span><span class="value" data-score></span></div>
        <div class="hud-stat"><span class="label">SECTOR</span><span class="value" data-sector></span></div>
        <div class="hud-stat"><span class="label">HI</span><span class="value dim" data-hi></span></div>
        <div class="hud-stat"><span class="lives" data-lives></span></div>
      </div>
      <div class="hud-fuel" data-fuel-box>
        <span class="label">E</span>
        <div class="fuel-bar"><div class="fuel-fill" data-fuel></div><div class="fuel-tick"></div></div>
        <span class="label">F</span>
      </div>
      <div class="hud-center">
        <div class="hud-message" data-message></div>
        <div class="hud-sub" data-sub></div>
      </div>
      <div class="hud-muted label" data-muted>SOUND OFF · M</div>
    `;
    const q = (sel: string) => root.querySelector<HTMLElement>(sel)!;
    this.score = q('[data-score]');
    this.hiScore = q('[data-hi]');
    this.sector = q('[data-sector]');
    this.lives = q('[data-lives]');
    this.fuelBox = q('[data-fuel-box]');
    this.fuelFill = q('[data-fuel]');
    this.message = q('[data-message]');
    this.sub = q('[data-sub]');
    this.muted = q('[data-muted]');
  }

  update(game: Game, status: HudStatus): void {
    if (game.score > this.hi) {
      this.hi = game.score;
      localStorage.setItem(HI_SCORE_KEY, String(this.hi));
    }
    setText(this.score, String(game.score).padStart(6, '0'));
    setText(this.hiScore, String(this.hi).padStart(6, '0'));
    setText(this.sector, String(game.sector + 1).padStart(2, '0'));

    if (game.lives !== this.shownLives) {
      this.shownLives = game.lives;
      this.lives.innerHTML = '<i></i>'.repeat(Math.max(game.lives, 0));
    }

    this.fuelFill.style.transform = `scaleX(${game.fuel})`;
    this.fuelBox.classList.toggle('low', game.fuel < LOW_FUEL && game.phase === 'playing');
    this.fuelBox.classList.toggle('refuel', game.refueling);

    this.muted.hidden = !status.muted;
    const [message, sub] = status.loading ? ['LOADING', ''] : messages(game);
    setText(this.message, message);
    setText(this.sub, sub);
  }
}

function messages(game: Game): [string, string] {
  switch (game.phase) {
    case 'ready':
      return game.score === 0 && game.checkpoint === 0
        ? ['PRESS SPACE TO LAUNCH', 'ARROWS / WASD TO FLY · SPACE TO FIRE · M SOUND · Q QUALITY · C SCANLINES']
        : ['PRESS SPACE TO CONTINUE', `${game.lives} ${game.lives === 1 ? 'LIFE' : 'LIVES'} LEFT`];
    case 'crashed':
      return ['SIGNAL LOST', ''];
    case 'gameover':
      return ['GAME OVER', `FINAL SCORE ${game.score} · PRESS SPACE`];
    case 'playing':
      return ['', ''];
  }
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
