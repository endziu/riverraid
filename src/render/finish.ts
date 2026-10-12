import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * Final screen pass, run after colour conversion: chromatic aberration kicks,
 * vignette, film grain, optional scanlines and a fade to black.
 */
export function createFinishPass(): ShaderPass {
  return new ShaderPass({
    name: 'FinishShader',
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uAberration: { value: 0 },
      uVignette: { value: 0.55 },
      uGrain: { value: 0.035 },
      uScanlines: { value: 0 },
      uFade: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uAberration;
      uniform float uVignette;
      uniform float uGrain;
      uniform float uScanlines;
      uniform float uFade;
      varying vec2 vUv;

      float hash(vec2 p) {
        p = fract(p * vec2(443.897, 441.423));
        p += dot(p, p.yx + 19.19);
        return fract((p.x + p.y) * p.x);
      }

      void main() {
        vec2 c = vUv - 0.5;
        vec3 col;
        if (uAberration > 0.001) {
          // Split colour channels radially, strongest at the edges.
          vec2 off = c * uAberration * (0.012 + 0.05 * dot(c, c));
          col = vec3(
            texture2D(tDiffuse, vUv + off).r,
            texture2D(tDiffuse, vUv).g,
            texture2D(tDiffuse, vUv - off).b
          );
        } else {
          col = texture2D(tDiffuse, vUv).rgb;
        }

        col *= 1.0 - uVignette * smoothstep(0.25, 0.85, length(c * vec2(1.25, 1.0)));
        col *= 1.0 - uScanlines * (0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159));
        col += (hash(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5) * uGrain;
        gl_FragColor = vec4(max(col, 0.0) * uFade, 1.0);
      }
    `,
  });
}
