import * as THREE from 'three';
import { BANK_HEIGHT } from '../world/river';

/** Uniforms shared by every world material. */
export const worldUniforms = {
  uTime: { value: 0 },
  /** Forward distance from the camera where the world starts and finishes fading out. */
  uFadeNear: { value: 115 },
  uFadeFar: { value: 175 },
  /** Sector tints either side of the nearest bridge (at z = uSplitZ). */
  uTintA: { value: new THREE.Color(0.0, 0.45, 0.85) },
  uTintB: { value: new THREE.Color(0.0, 0.45, 0.85) },
  uSplitZ: { value: -1e6 },
};

const vertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

export const commonGlsl = /* glsl */ `
  uniform float uTime;
  uniform float uFadeNear;
  uniform float uFadeFar;
  uniform vec3 uTintA;
  uniform vec3 uTintB;
  uniform float uSplitZ;
  varying vec3 vWorld;

  // Fades by forward distance, so the fade line runs parallel to the horizon.
  float distFade() {
    return 1.0 - smoothstep(uFadeNear, uFadeFar, cameraPosition.z - vWorld.z);
  }

  // The current sector's accent colour, blended across the bridge.
  vec3 tint() {
    return mix(uTintA, uTintB, smoothstep(uSplitZ + 25.0, uSplitZ - 25.0, vWorld.z));
  }

  // Anti-aliased grid lines: 1 on a line, 0 elsewhere.
  float grid(vec2 p, float spacing, float thickness) {
    vec2 c = p / spacing;
    // The floor on fwidth avoids 0/0 (NaN, which bloom smears over the whole screen).
    vec2 g = abs(fract(c - 0.5) - 0.5) / max(fwidth(c), vec2(1e-5));
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
    fragmentShader: `${commonGlsl}\n${declarations}\nvoid main() {\n${fragmentBody}\n}`,
    side: THREE.DoubleSide,
  });
}

export const landTopMaterial = worldMaterial(/* glsl */ `
  vec2 p = vWorld.xz;
  float minor = grid(p, 5.0, 1.0);
  float major = grid(p, 25.0, 1.3);
  vec3 col = vec3(0.004, 0.008, 0.02) + tint() * (minor * 0.05 + major * 0.22);
  gl_FragColor = vec4(col * distFade(), 1.0);
`);

export const wallMaterial = worldMaterial(/* glsl */ `
  float t = clamp(vWorld.y / ${BANK_HEIGHT.toFixed(1)}, 0.0, 1.0);
  vec3 col = vec3(0.003, 0.006, 0.015) + tint() * (0.03 + 0.3 * pow(t, 4.0));
  gl_FragColor = vec4(col * distFade(), 1.0);
`);

/** Water body shared by the plain and the reflective water. */
export const waterGlsl = /* glsl */ `
  vec3 waterColor() {
    vec2 p = vWorld.xz;
    float g = grid(p, 2.5, 0.8) * 0.04;
    float band = pow(0.5 + 0.5 * sin(vWorld.z * 0.12 + uTime * 1.6), 10.0) * 0.07;
    return vec3(0.0, 0.005, 0.018) + tint() * (g + band);
  }
`;

export const waterMaterial = worldMaterial(
  /* glsl */ `gl_FragColor = vec4(waterColor() * distFade(), 1.0);`,
  {},
  waterGlsl,
);

/** Glowing colour; values above 1 feed the bloom pass. Tinted ones mix in the sector colour. */
function glowMaterial(color: THREE.Vector3, tinted = 0) {
  return worldMaterial(
    /* glsl */ `gl_FragColor = vec4(mix(uColor, (tint() * 0.8 + 0.25) * length(uColor) * 0.75, uTinted) * distFade(), 1.0);`,
    { uColor: { value: color }, uTinted: { value: tinted } },
    'uniform vec3 uColor; uniform float uTinted;',
  );
}

export const bankEdgeMaterial = glowMaterial(new THREE.Vector3(0.3, 0.8, 1.0).multiplyScalar(1.7), 1);
export const waterlineMaterial = glowMaterial(new THREE.Vector3(0.0, 0.5, 1.0).multiplyScalar(1.1), 1);

export const roadMaterial = glowMaterial(new THREE.Vector3(1.0, 0.62, 0.12).multiplyScalar(0.8));

/** Road lamps leading to a bridge; a pulse chases along them towards the river. */
export const roadLightMaterial = new THREE.ShaderMaterial({
  uniforms: { ...worldUniforms, uColor: { value: new THREE.Vector3(1.0, 0.62, 0.12) } },
  vertexShader: /* glsl */ `
    attribute float aPhase;
    varying vec3 vWorld;
    varying float vPhase;
    void main() {
      vPhase = aPhase;
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
  fragmentShader: /* glsl */ `
    ${commonGlsl}
    uniform vec3 uColor;
    varying float vPhase;
    void main() {
      float chase = pow(fract(vPhase / 36.0 + uTime * 0.9), 12.0);
      gl_FragColor = vec4(uColor * (0.35 + 2.6 * chase) * distFade(), 1.0);
    }
  `,
  side: THREE.DoubleSide,
});

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
    ${commonGlsl}
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
