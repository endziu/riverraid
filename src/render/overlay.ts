import * as THREE from 'three';
import type { Game } from '../game/game';
import { ALTITUDE } from './models';

const POPUP_TIME = 1.1;
const POPUP_RISE = 46;
/** Warn about a jet this much earlier than it starts its run. */
const JET_WARNING_LEAD = 70;
const EDGE_MARGIN = 26;
/** The warning clears this far before the jet crosses the bank. */
const JET_CLEAR = 6;
const TOAST_TIME = 1.6;

interface Popup {
  el: HTMLElement;
  at: THREE.Vector3;
  age: number;
}

const v = new THREE.Vector3();

/** Screen-space labels tied to world positions: score pop-ups and jet warnings. */
export class Overlay {
  private readonly root: HTMLElement;
  private readonly popups: Popup[] = [];
  private readonly markers = new Map<number, HTMLElement>();
  private readonly toastEl: HTMLElement;
  private toastAge = Infinity;

  constructor(root: HTMLElement) {
    this.root = root;
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    root.append(this.toastEl);
  }

  popup(at: THREE.Vector3, text: string, variant = ''): void {
    const el = document.createElement('div');
    el.className = `popup ${variant}`;
    el.textContent = text;
    this.root.append(el);
    this.popups.push({ el, at: at.clone(), age: 0 });
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastAge = 0;
  }

  clearPopups(): void {
    for (const p of this.popups) p.el.remove();
    this.popups.length = 0;
  }

  /** `dt` is game time so pop-ups freeze and slow with the action. */
  update(game: Game, camera: THREE.Camera, dt: number, realDt: number): void {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    const toScreen = (p: THREE.Vector3) => {
      v.copy(p).project(camera);
      return [(v.x + 1) * 0.5 * w, (1 - v.y) * 0.5 * h, v.z] as const;
    };

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.age += dt;
      const t = p.age / POPUP_TIME;
      if (t >= 1) {
        p.el.remove();
        this.popups.splice(i, 1);
        continue;
      }
      const [x, y] = toScreen(p.at);
      const rise = POPUP_RISE * (1 - (1 - t) ** 3);
      const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.6 : 1.2 - Math.min((t - 0.12) * 2, 0.2);
      p.el.style.transform = `translate(${x}px, ${y - rise}px) translate(-50%, -50%) scale(${pop})`;
      p.el.style.opacity = String(Math.min(1, (1 - t) * 3));
    }

    this.updateJetMarkers(game, toScreen, w, h);

    this.toastAge += realDt;
    this.toastEl.classList.toggle('show', this.toastAge < TOAST_TIME);
  }

  private updateJetMarkers(
    game: Game,
    toScreen: (p: THREE.Vector3) => readonly [number, number, number],
    w: number,
    h: number,
  ): void {
    const seen = new Set<number>();
    if (game.phase === 'playing') {
      for (const e of game.entities) {
        if (e.kind !== 'jet') continue;
        const dy = e.y - game.y;
        if (dy < -5 || dy > e.activateAt + JET_WARNING_LEAD) continue;
        // Until it reaches the river.
        const s = game.river.sample(e.y);
        if (Math.abs(e.x - s.center) < s.halfWidth + JET_CLEAR) continue;
        const [, y] = toScreen(v.set(e.x, ALTITUDE.jet, -e.y));
        const side = e.vx > 0 ? -1 : 1;
        seen.add(e.id);
        let el = this.markers.get(e.id);
        if (!el) {
          el = document.createElement('div');
          el.className = `jet-marker ${side < 0 ? 'left' : 'right'}`;
          this.root.append(el);
          this.markers.set(e.id, el);
        }
        const urgency = e.active ? 1 : 1 - (dy - e.activateAt) / JET_WARNING_LEAD;
        el.style.setProperty('--blink', `${0.5 - 0.35 * urgency}s`);
        const sx = side < 0 ? EDGE_MARGIN : w - EDGE_MARGIN;
        const sy = Math.min(Math.max(y, 90), h - 90);
        el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
      }
    }
    for (const [id, el] of this.markers) {
      if (seen.has(id)) continue;
      el.remove();
      this.markers.delete(id);
    }
  }
}
