import * as THREE from 'three';

// 4-step discrete cel-shading ramp texture
let sharedToonGradient: THREE.DataTexture | null = null;

export function get4StepToonGradient(): THREE.DataTexture {
  if (sharedToonGradient) return sharedToonGradient;

  // 64-step smooth painterly toon gradient texture to prevent high-frequency threshold flickering on surfaces
  const steps = 64;
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    let val: number;
    if (t < 0.25) {
      val = THREE.MathUtils.lerp(50, 115, THREE.MathUtils.smoothstep(t, 0.18, 0.25));
    } else if (t < 0.55) {
      val = THREE.MathUtils.lerp(115, 180, THREE.MathUtils.smoothstep(t, 0.48, 0.55));
    } else {
      val = THREE.MathUtils.lerp(180, 255, THREE.MathUtils.smoothstep(t, 0.78, 0.85));
    }
    data[i] = Math.round(val);
  }

  const texture = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  sharedToonGradient = texture;
  return sharedToonGradient;
}

// Convert a hex color to painterly tone (deep teal, burnt orange, dark navy harmony)
export function desaturateColor(hex: number, desatAmount: number = 0.22): THREE.Color {
  const col = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  hsl.s = Math.max(0.04, hsl.s * (1 - desatAmount));
  if (hsl.l < 0.4) {
    hsl.l *= 0.85;
  }
  col.setHSL(hsl.h, hsl.s, hsl.l);
  return col;
}

export interface ToonMaterialOptions {
  color: number;
  desaturate?: number;
  emissive?: number;
  emissiveIntensity?: number;
  wireframe?: boolean;
  side?: THREE.Side;
}

// Factory to create Telltale painterly cel-shaded toon materials (matte, non-glowing)
export function createToonMaterial(options: ToonMaterialOptions): THREE.MeshToonMaterial {
  const gradientMap = get4StepToonGradient();
  const adjustedColor = desaturateColor(options.color, options.desaturate ?? 0.25);

  const mat = new THREE.MeshToonMaterial({
    color: adjustedColor,
    gradientMap: gradientMap,
    side: options.side ?? THREE.DoubleSide,
  });

  // Keep emissive strictly minimal (paint pigment, no glowing bloom)
  if (options.emissive) {
    mat.emissive = new THREE.Color(options.emissive);
    mat.emissiveIntensity = options.emissiveIntensity ?? 0.08;
  }

  return mat;
}

// Inverted Hull Ink Outline Material
const outlineMaterial = new THREE.MeshBasicMaterial({
  color: 0x050508, // Rich comic book black ink
  side: THREE.BackSide,
});

/**
 * Creates a thick black ink outline mesh using the inverted hull technique
 * Widely used in Telltale Games (The Walking Dead, Wolf Among Us)
 */
export function addInkOutline(
  mesh: THREE.Mesh,
  thickness: number = 0.035,
  color: number = 0x050508
): THREE.Mesh {
  const outlineMat = color === 0x050508 ? outlineMaterial : new THREE.MeshBasicMaterial({
    color: color,
    side: THREE.BackSide,
  });

  const outlineMesh = new THREE.Mesh(mesh.geometry, outlineMat);
  // Expand outward along normals or scale
  outlineMesh.scale.multiplyScalar(1 + thickness);
  mesh.add(outlineMesh);
  return outlineMesh;
}

/**
 * Traverses a group and attaches ink outlines to eligible meshes
 */
export function applyInkOutlinesToGroup(
  group: THREE.Group | THREE.Object3D,
  thickness: number = 0.035,
  skipTransparent: boolean = true
) {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && !(child.material instanceof THREE.MeshBasicMaterial && child.material.side === THREE.BackSide)) {
      // Don't add outline to panes of glass, backdrops, or particles
      if (skipTransparent && (child.material as THREE.Material).transparent) return;
      if (child.geometry instanceof THREE.PlaneGeometry && (child.geometry.parameters.width > 10 || child.geometry.parameters.height > 10)) return;
      // Attach ink outline
      addInkOutline(child, thickness);
    }
  });
}
