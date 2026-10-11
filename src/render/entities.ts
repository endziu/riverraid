import * as THREE from 'three';
import type { Game } from '../game/game';
import { ALTITUDE, COLORS, createModel, disposeModel, fuelStripeMaterial } from './models';
import { SHIP_ALTITUDE } from './ship';

const bulletGeometry = new THREE.BoxGeometry(0.22, 0.22, 2.6);
const bulletMaterial = new THREE.MeshBasicMaterial({ color: COLORS.player, toneMapped: false });

/** Mirrors game entities and bullets as scene objects. */
export class EntityView {
  readonly group = new THREE.Group();
  private readonly models = new Map<number, THREE.Object3D>();
  private readonly bullets: THREE.Mesh[] = [];

  sync(game: Game, alpha: number, time: number): void {
    const seen = new Set<number>();
    for (const e of game.entities) {
      seen.add(e.id);
      let obj = this.models.get(e.id);
      if (!obj) {
        obj = createModel(e);
        this.models.set(e.id, obj);
        this.group.add(obj);
      }
      obj.position.set(e.prevX + (e.x - e.prevX) * alpha, ALTITUDE[e.kind], -e.y);
      if (e.vx !== 0) obj.scale.x = e.vx < 0 ? -1 : 1;
      if (e.kind === 'heli') {
        obj.position.y += Math.sin(time * 3 + e.id) * 0.25;
        obj.getObjectByName('rotor')!.rotation.y = time * 25;
      }
    }
    for (const [id, obj] of this.models) {
      if (seen.has(id)) continue;
      this.group.remove(obj);
      disposeModel(obj);
      this.models.delete(id);
    }

    fuelStripeMaterial.color.copy(COLORS.fuel).multiplyScalar(0.6 + 0.4 * Math.sin(time * 5));

    while (this.bullets.length < game.bullets.length) {
      const m = new THREE.Mesh(bulletGeometry, bulletMaterial);
      this.bullets.push(m);
      this.group.add(m);
    }
    this.bullets.forEach((m, i) => {
      const b = game.bullets[i];
      m.visible = !!b;
      if (b) m.position.set(b.x, SHIP_ALTITUDE, -(b.prevY + (b.y - b.prevY) * alpha));
    });
  }
}
