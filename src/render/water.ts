import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { commonGlsl, waterGlsl, waterMaterial, worldUniforms } from './materials';

const SIZE = 800;
/** How strongly the mirrored scene shows in the water. */
const REFLECTION = 0.32;

const reflectiveShader = {
  name: 'RiverWater',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
  fragmentShader: /* glsl */ `
    ${commonGlsl}
    ${waterGlsl}
    uniform sampler2D tDiffuse;
    varying vec4 vUv;

    vec3 reflection() {
      vec2 ripple = vec2(
        sin(vWorld.z * 0.45 + uTime * 2.3) + 0.5 * sin(vWorld.x * 0.7 - uTime * 1.7),
        cos(vWorld.z * 0.31 - uTime * 1.9)
      ) * 0.0035 * vUv.w;
      // A short vertical smear reads as moving water under neon.
      vec3 sum = vec3(0.0);
      for (int i = -2; i <= 2; i++) {
        vec4 uv = vUv;
        uv.xy += ripple + vec2(0.0, float(i) * 0.004 * vUv.w);
        sum += texture2DProj(tDiffuse, uv).rgb * (3.0 - abs(float(i)));
      }
      return sum / 9.0;
    }

    void main() {
      vec3 col = waterColor() + reflection() * ${REFLECTION.toFixed(2)};
      gl_FragColor = vec4(col * distFade(), 1.0);
    }
  `,
};

/** The river surface: a mirrored-scene reflection when enabled, flat shading otherwise. */
export class Water {
  readonly group = new THREE.Group();
  private readonly plain: THREE.Mesh;
  private readonly mirror: Reflector;

  constructor(camera: THREE.Camera) {
    this.plain = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2), waterMaterial);
    this.mirror = new Reflector(new THREE.PlaneGeometry(SIZE, SIZE), {
      shader: reflectiveShader,
      textureWidth: 256,
      textureHeight: 256,
      clipBias: 0.003,
      multisample: 0,
    });
    this.mirror.rotation.x = -Math.PI / 2;
    // The reflector clones its uniforms; share the live world ones instead.
    Object.assign((this.mirror.material as THREE.ShaderMaterial).uniforms, worldUniforms);
    // The mirror camera only sees layer 0, so screen-space effects can opt out.
    this.mirror.getReflectionCamera(camera).layers.set(0);
    this.group.add(this.plain, this.mirror);
  }

  /** `scale` is the reflection resolution relative to the screen; 0 turns reflections off. */
  setQuality(scale: number, width: number, height: number): void {
    this.mirror.visible = scale > 0;
    this.plain.visible = scale === 0;
    if (scale > 0) this.mirror.getRenderTarget().setSize(Math.round(width * scale), Math.round(height * scale));
  }

  update(x: number, z: number): void {
    this.group.position.set(x, 0, z);
  }
}
