import * as THREE from 'three';
import { SECTION_LEN } from '../world/river';
import { THEME_COUNT, sectorTheme } from '../world/props';
import { worldUniforms } from './materials';

/** Terrain accent colour per theme (see `sectorTheme`). Kept cool so entities stand out. */
const THEMES: readonly THREE.Color[] = [
  new THREE.Color(0.0, 0.45, 0.85), // cyan
  new THREE.Color(0.32, 0.18, 0.95), // violet
  new THREE.Color(0.0, 0.62, 0.5), // teal
  new THREE.Color(0.7, 0.1, 0.75), // magenta
  new THREE.Color(0.35, 0.6, 1.0), // ice
];
if (THEMES.length !== THEME_COUNT) throw new Error('palette.ts: one colour per theme');

export function themeColor(seed: number, section: number): THREE.Color {
  return THEMES[sectorTheme(seed, section)];
}

/**
 * Points the shared tint uniforms at the sectors either side of the nearest
 * bridge; shaders blend between them across the bridge.
 */
export function updatePalette(seed: number, playerY: number): void {
  const bridge = Math.max(Math.round(playerY / SECTION_LEN), 1);
  worldUniforms.uTintA.value.copy(themeColor(seed, bridge - 1));
  worldUniforms.uTintB.value.copy(themeColor(seed, bridge));
  worldUniforms.uSplitZ.value = -bridge * SECTION_LEN;
}
