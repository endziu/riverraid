import * as THREE from 'three';
import { BANK_HEIGHT } from '../world/river';
import { commonGlsl, worldUniforms } from './materials';

const WIDTH = 2400;
const HEIGHT = 500;

/**
 * A backdrop wall standing where the world fades out: a dark gradient sky with a
 * faint grid and stars, and a glow line where the faded land meets it.
 */
export class Horizon {
  readonly mesh: THREE.Mesh;

  constructor() {
    const geometry = new THREE.PlaneGeometry(WIDTH, HEIGHT).translate(0, HEIGHT / 2 - 2, 0);
    const material = new THREE.ShaderMaterial({
      uniforms: worldUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        ${commonGlsl}
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        void main() {
          vec3 t = tint();
          float h = vWorld.y - ${BANK_HEIGHT.toFixed(1)};
          float above = max(h, 0.0);

          vec3 col = vec3(0.0, 0.0, 0.004);
          col += t * 0.07 * exp(-above / 10.0);
          col += t * 0.025 * exp(-above / 60.0);

          // Grid: vertical lines, and horizontal ones spreading out with height.
          float g = grid(vec2(vWorld.x, log2(1.0 + above / 4.0) * 12.0), 12.0, 1.0);
          col += t * g * 0.07 * exp(-above / 60.0);

          // Sparse stars, fading in higher up.
          vec2 cell = floor(vWorld.xy / 3.0);
          float dot = smoothstep(0.22, 0.05, length(fract(vWorld.xy / 3.0) - 0.5));
          float star = step(0.985, hash(cell)) * dot * smoothstep(15.0, 50.0, above);
          star *= 0.5 + 0.5 * sin(uTime * (1.0 + 3.0 * hash(cell + 7.0)) + hash(cell) * 40.0);
          col += vec3(0.5, 0.7, 1.0) * star * 0.6;

          // Glow line where the faded world meets the sky.
          float line = exp(-abs(h) * 3.0);
          col += (t * 1.3 + 0.15) * line;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  /** Stand the wall `distance` ahead of the camera. */
  update(camX: number, camZ: number, distance: number): void {
    this.mesh.position.set(camX, 0, camZ - distance);
  }
}
