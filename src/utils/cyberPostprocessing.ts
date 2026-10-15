import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export const CyberPostShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0.0 },
    uAberration: { value: 0.0015 },
    uScanlineIntensity: { value: 0.035 },
    uScanlineCount: { value: 360.0 },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.03 },
    uGlitch: { value: 0.0 },
    uProgress: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAberration;
    uniform float uScanlineIntensity;
    uniform float uScanlineCount;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uGlitch;
    uniform float uProgress;
    varying vec2 vUv;

    // Pseudo-random noise for light film grain
    float randomNoise(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // 1. Horizontal Glitch Slice Displacement
      if (uGlitch > 0.001) {
        float slice = step(0.82, sin(uv.y * 45.0 + uTime * 65.0));
        float slice2 = step(0.92, sin(uv.y * 120.0 - uTime * 90.0));
        float displacement = (sin(uTime * 50.0 + uv.y * 20.0) * 0.025 * uGlitch * slice) +
                             (cos(uTime * 80.0) * 0.04 * uGlitch * slice2);
        uv.x += displacement;
      }

      // 2. Chromatic Aberration (radial + glitch burst)
      vec2 dir = uv - vec2(0.5);
      float distSq = dot(dir, dir);
      float abAmount = (uAberration + distSq * 0.004) * uProgress + (uGlitch * 0.018);

      vec4 colR = texture2D(tDiffuse, uv + dir * abAmount);
      vec4 colG = texture2D(tDiffuse, uv);
      vec4 colB = texture2D(tDiffuse, uv - dir * abAmount);

      vec3 color = vec3(colR.r, colG.g, colB.b);

      // Extra RGB channel color offset during glitch
      if (uGlitch > 0.05) {
        color.r += uGlitch * 0.08 * sin(uTime * 30.0);
        color.b += uGlitch * 0.12 * cos(uTime * 45.0);
      }

      // 3. CRT Scanlines (low frequency, very low contrast so they do not shimmer)
      float scanline = sin(uv.y * uScanlineCount) * 0.5 + 0.5;
      color *= 1.0 - (scanline * uScanlineIntensity * uProgress);

      // 4. Smooth Dark Vignette
      float vig = smoothstep(0.85, 0.28, length(dir));
      color = mix(color, color * vig, uVignette * uProgress);

      // 5. Light Film Grain
      float grain = (randomNoise(uv + vec2(uTime * 0.05, -uTime * 0.03)) - 0.5) * 2.0;
      color += grain * (uGrain * uProgress);

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), colG.a);
    }
  `,
};

export class CyberPostprocessingPipeline {
  public composer: EffectComposer;
  public renderPass: RenderPass;
  public bloomPass: UnrealBloomPass;
  public cyberPass: ShaderPass;
  private renderer: THREE.WebGLRenderer;
  private isHalfResBloom: boolean = true;
  private width: number;
  private height: number;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number
  ) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;

    // Use single existing renderer
    this.composer = new EffectComposer(renderer);

    // 1. Base Render Pass
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // 2. Unreal Bloom Pass (strength 0.9, radius 0.6, threshold 0.82, half-res)
    const bloomRes = new THREE.Vector2(Math.floor(width / 2), Math.floor(height / 2));
    this.bloomPass = new UnrealBloomPass(bloomRes, 0.9, 0.6, 0.82);
    this.composer.addPass(this.bloomPass);

    // 3. Custom Cyber Shader Pass (Aberration, Scanlines, Vignette, Grain, Glitch)
    this.cyberPass = new ShaderPass(CyberPostShader);
    this.cyberPass.renderToScreen = true;
    this.composer.addPass(this.cyberPass);
  }

  public setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.composer.setSize(width, height);
    const div = this.isHalfResBloom ? 2 : 4;
    this.bloomPass.resolution.set(Math.floor(width / div), Math.floor(height / div));
  }

  public setLowPerformance(isLowFps: boolean) {
    if (this.isHalfResBloom === !isLowFps) return;
    this.isHalfResBloom = !isLowFps;
    const div = this.isHalfResBloom ? 2 : 4;
    this.bloomPass.resolution.set(Math.floor(this.width / div), Math.floor(this.height / div));
  }

  public update(time: number, progress: number, glitchIntensity: number) {
    this.cyberPass.uniforms.uTime.value = time;
    this.cyberPass.uniforms.uProgress.value = progress;
    this.cyberPass.uniforms.uGlitch.value = glitchIntensity;
    this.bloomPass.strength = 0.9 * progress;
  }

  public render() {
    this.composer.render();
  }

  public dispose() {
    this.composer.dispose();
  }
}
