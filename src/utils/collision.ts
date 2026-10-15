import * as THREE from 'three';

export interface BoxCollider2D {
  id: string;
  name: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height?: number;
  centerY?: number;
}

export const CHARACTER_COLLIDER_RADIUS = 0.2; // 0.4 units wide circle collider

/**
 * Resolves 2D Circle vs AABB Box Colliders with smooth sliding along edges.
 * Performs multi-box resolution so corners and tight edges slide smoothly.
 */
export function resolveCharacterCollisions(
  currentPos: THREE.Vector3,
  colliders: BoxCollider2D[],
  radius: number = CHARACTER_COLLIDER_RADIUS,
  outTouchingCollider?: { current: string | null }
): THREE.Vector3 {
  const resolved = currentPos.clone();
  const iterations = 3; // 3 relaxation passes for smooth corner sliding
  let touchedName: string | null = null;

  for (let iter = 0; iter < iterations; iter++) {
    let hasCollided = false;

    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];

      // Quick broadphase AABB check (only check nearby colliders)
      if (
        resolved.x + radius < box.minX ||
        resolved.x - radius > box.maxX ||
        resolved.z + radius < box.minZ ||
        resolved.z - radius > box.maxZ
      ) {
        continue;
      }

      // Find closest point on AABB to character center
      const closestX = THREE.MathUtils.clamp(resolved.x, box.minX, box.maxX);
      const closestZ = THREE.MathUtils.clamp(resolved.z, box.minZ, box.maxZ);

      const dx = resolved.x - closestX;
      const dz = resolved.z - closestZ;
      const distSq = dx * dx + dz * dz;

      // Check for collision
      if (distSq < radius * radius) {
        hasCollided = true;
        touchedName = box.name || box.id;
        const dist = Math.sqrt(distSq);

        if (dist > 0.0001) {
          // Normal collision with outer edge/corner: push out along normal
          const overlap = radius - dist;
          const nx = dx / dist;
          const nz = dz / dist;
          resolved.x += nx * overlap;
          resolved.z += nz * overlap;
        } else {
          // Deep inside box: find nearest boundary edge to push out along shortest axis
          const dLeft = Math.abs(resolved.x - box.minX);
          const dRight = Math.abs(resolved.x - box.maxX);
          const dNear = Math.abs(resolved.z - box.minZ);
          const dFar = Math.abs(resolved.z - box.maxZ);

          const minD = Math.min(dLeft, dRight, dNear, dFar);

          if (minD === dLeft) {
            resolved.x = box.minX - radius;
          } else if (minD === dRight) {
            resolved.x = box.maxX + radius;
          } else if (minD === dNear) {
            resolved.z = box.minZ - radius;
          } else {
            resolved.z = box.maxZ + radius;
          }
        }
      }
    }

    if (!hasCollided) break;
  }

  if (outTouchingCollider) {
    outTouchingCollider.current = touchedName;
  }

  return resolved;
}

/**
 * Creates visual 3D translucent debug helper meshes for colliders
 */
export function createColliderDebugGroup(colliders: BoxCollider2D[], color: number = 0x22c55e): THREE.Group {
  const group = new THREE.Group();
  group.name = 'DebugCollidersGroup';

  const boxMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.28,
    wireframe: false,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x4ade80,
    wireframe: true,
  });

  colliders.forEach((box) => {
    const width = Math.max(0.05, box.maxX - box.minX);
    const depth = Math.max(0.05, box.maxZ - box.minZ);
    const height = box.height ?? 1.2;
    const centerY = box.centerY ?? height / 2;

    const centerX = (box.minX + box.maxX) / 2;
    const centerZ = (box.minZ + box.maxZ) / 2;

    const geom = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geom, boxMat);
    mesh.position.set(centerX, centerY, centerZ);

    const wire = new THREE.Mesh(geom, wireMat);
    wire.position.set(centerX, centerY, centerZ);

    group.add(mesh, wire);
  });

  return group;
}
