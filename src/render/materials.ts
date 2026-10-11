import * as THREE from 'three';
import { BANK_HEIGHT } from '../world/river';

/** Uniforms shared by every world material. */
export const worldUniforms = {
  uTime: { value: 0 },
  uFadeNear: { value: 115 },
  uFadeFar: { value: 175 },
};

const vertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const common = /* glsl */ `
  uniform float uTime;
  uniform float uFadeNear;
  uniform float uFadeFar;
  varying vec3 vWorld;

  float distFade() {
    return 1.0 - smoothstep(uFadeNear, uFadeFar, distance(vWorld, cameraPosition));
  }

  // Anti-aliased grid lines: 1 on a line, 0 elsewhere.
  float grid(vec2 p, float spacing, float thickness) {
    vec2 c = p / spacing;
    vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
    return 1.0 - min(min(g.x, g.y) / thickness, 1.0);
  }
`;

function worldMaterial(
  fragmentBody: string,
  extraUniforms: Record<string, THREE.IUniform> = {},
  declarations = '',
) {
  return new THREE.ShaderMaterial({
    uniforms: { ...worldUniforms, ...extraUniforms },
    vertexShader: vertex,
    fragmentShader: `${common}\n${declarations}\nvoid main() {\n${fragmentBody}\n}`,
    side: THREE.DoubleSide,
  });
}

export const landTopMaterial = worldMaterial(/* glsl */ `
  vec2 p = vWorld.xz;
  float minor = grid(p, 5.0, 1.0);
  float major = grid(p, 25.0, 1.3);
  vec3 col = vec3(0.004, 0.008, 0.02) + vec3(0.0, 0.45, 0.85) * (minor * 0.05 + major * 0.22);
  gl_FragColor = vec4(col * distFade(), 1.0);
`);

export const wallMaterial = worldMaterial(/* glsl */ `
  float t = clamp(vWorld.y / ${BANK_HEIGHT.toFixed(1)}, 0.0, 1.0);
  vec3 col = vec3(0.003, 0.006, 0.015) + vec3(0.0, 0.4, 0.9) * (0.03 + 0.3 * pow(t, 4.0));
  gl_FragColor = vec4(col * distFade(), 1.0);
`);

export const waterMaterial = worldMaterial(/* glsl */ `
  vec2 p = vWorld.xz;
  float g = grid(p, 2.5, 0.8) * 0.04;
  float band = pow(0.5 + 0.5 * sin(vWorld.z * 0.12 + uTime * 1.6), 10.0) * 0.07;
  vec3 col = vec3(0.0, 0.005, 0.018) + vec3(0.0, 0.4, 0.85) * (g + band);
  gl_FragColor = vec4(col * distFade(), 1.0);
`);

/** Flat glowing colour; values above 1 feed the bloom pass. */
export function glowMaterial(color: THREE.Vector3) {
  return worldMaterial(
    /* glsl */ `gl_FragColor = vec4(uColor * distFade(), 1.0);`,
    { uColor: { value: color } },
    'uniform vec3 uColor;',
  );
}

export const bankEdgeMaterial = glowMaterial(new THREE.Vector3(0.3, 0.8, 1.0).multiplyScalar(1.7));
export const waterlineMaterial = glowMaterial(new THREE.Vector3(0.0, 0.5, 1.0).multiplyScalar(1.1));

export const roadMaterial = glowMaterial(new THREE.Vector3(1.0, 0.62, 0.12).multiplyScalar(0.8));

/** Translucent energy wall stretched across a bridge. */
export const barrierMaterial = new THREE.ShaderMaterial({
  uniforms: { ...worldUniforms, uColor: { value: new THREE.Vector3(1.0, 0.55, 0.1) } },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
  fragmentShader: /* glsl */ `
    ${common}
    uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      float scan = pow(0.5 + 0.5 * sin(vUv.y * 40.0 - uTime * 5.0), 6.0);
      float rim = smoothstep(0.85, 1.0, vUv.y) + smoothstep(0.08, 0.0, vUv.y);
      float a = 0.06 + 0.18 * scan + 0.5 * rim;
      gl_FragColor = vec4(uColor * a * distFade(), 1.0);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
