import * as THREE from 'three';

// 1. Fresnel Rim-Light Material (Additive, View-Angle Based)
export function createFresnelRimMaterial(colorHex: number = 0x06b6d4, power: number = 2.8) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uPower: { value: power },
      uIntensity: { value: 1.0 },
      uProgress: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uPower;
      uniform float uIntensity;
      uniform float uProgress;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        if (uProgress <= 0.001) discard;
        float fresnel = pow(1.0 - max(0.0, dot(vNormal, vViewDir)), uPower);
        float alpha = fresnel * uIntensity * uProgress;
        gl_FragColor = vec4(uColor * (1.2 + fresnel * 0.8), alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

// 2. Animated Scrolling Energy Pulse Panel Line Material
export function createAnimatedPanelLineMaterial(colorHex: number = 0x06b6d4) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uColor: { value: new THREE.Color(colorHex) },
      uBaseColor: { value: new THREE.Color(0x1e293b) },
      uProgress: { value: 0.0 },
      uPulseSpeed: { value: 2.2 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec3 uBaseColor;
      uniform float uProgress;
      uniform float uPulseSpeed;
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      void main() {
        if (uProgress <= 0.001) discard;
        
        // Traveling light wave pulse along corridor Z axis
        float pulse1 = sin(vWorldPosition.z * 1.8 - uTime * uPulseSpeed);
        float pulse2 = sin(vWorldPosition.z * 0.9 + uTime * (uPulseSpeed * 0.7));
        float wave = pow(max(0.0, pulse1 * 0.6 + pulse2 * 0.4), 3.5);
        
        vec3 col = mix(uBaseColor, uColor * 1.6, wave);
        float alpha = mix(0.15, 0.95, wave) * uProgress;
        
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// 3. Faux Volumetric Light Shafts (Additive Soft-Gradient Cones)
export function createVolumetricLightShaft(height: number = 3.5, topRadius: number = 0.15, bottomRadius: number = 1.1) {
  const geo = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 16, 1, true);
  geo.translate(0, -height / 2, 0);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x06b6d4) },
      uProgress: { value: 0.0 },
      uHeight: { value: height },
    },
    vertexShader: `
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vPosition = position;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uProgress;
      uniform float uHeight;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        if (uProgress <= 0.001) discard;
        // Soft vertical fade: brightest at top, fading to 0 at bottom
        float vFade = clamp(1.0 - (-vPosition.y / uHeight), 0.0, 1.0);
        vFade = pow(vFade, 1.4);
        
        // Edge grazing angle softness
        float edgeSoftness = pow(abs(dot(vNormal, vViewDir)), 0.6);
        float alpha = vFade * edgeSoftness * 0.28 * uProgress;
        
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  return new THREE.Mesh(geo, mat);
}

// 4. Pooled Drifting Cyber Dust Particles (THREE.Points with Additive Blending)
export class CyberDustField {
  public points: THREE.Points;
  private positions: Float32Array;
  private velocities: Float32Array;
  private count: number;
  private material: THREE.PointsMaterial;

  constructor(count: number = 90) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      this.positions[i * 3 + 0] = (Math.random() - 0.5) * 3.2; // X
      this.positions[i * 3 + 1] = 0.2 + Math.random() * 3.4;   // Y
      this.positions[i * 3 + 2] = 4.5 + Math.random() * 14.5;  // Z

      this.velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.15;
      this.velocities[i * 3 + 1] = 0.08 + Math.random() * 0.18;
      this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    // Create soft circular glowing dot texture on offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.35, 'rgba(56, 189, 248, 0.8)');
      grad.addColorStop(0.7, 'rgba(6, 182, 212, 0.3)');
      grad.addColorStop(1, 'rgba(6, 182, 212, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 32);
    }
    const texture = new THREE.CanvasTexture(canvas);

    this.material = new THREE.PointsMaterial({
      size: 0.12,
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: 0x38bdf8,
      opacity: 0.0,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.visible = false;
  }

  public update(delta: number, progress: number, time: number) {
    if (progress <= 0.001) {
      this.points.visible = false;
      return;
    }
    this.points.visible = true;
    this.material.opacity = progress * 0.65;

    const posAttr = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i < this.count; i++) {
      const idx = i * 3;
      arr[idx + 0] += (this.velocities[idx + 0] + Math.sin(time * 1.5 + i) * 0.02) * delta;
      arr[idx + 1] += this.velocities[idx + 1] * delta;
      arr[idx + 2] += (this.velocities[idx + 2] + Math.cos(time * 1.2 + i) * 0.02) * delta;

      // Wrap around bounds
      if (arr[idx + 1] > 3.7) {
        arr[idx + 1] = 0.2;
        arr[idx + 0] = (Math.random() - 0.5) * 3.2;
        arr[idx + 2] = 4.5 + Math.random() * 14.5;
      }
    }
    posAttr.needsUpdate = true;
  }
}

// 5. Anamorphic Lens Streak Flare Sprite
export function createAnamorphicStreakSprite(colorHex: number = 0x38bdf8) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 8, 0, 64, 8, 64);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.25, 'rgba(56, 189, 248, 0.85)');
    grad.addColorStop(0.65, 'rgba(6, 182, 212, 0.35)');
    grad.addColorStop(1.0, 'rgba(6, 182, 212, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 16);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: texture,
    color: new THREE.Color(colorHex),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.0,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.9, 0.08, 1.0);
  return { sprite, material: mat };
}
