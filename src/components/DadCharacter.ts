import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadGltfWithFallback, stripRootMotion, getClipStatus } from '../utils/assetLoader';
import { createToonMaterial } from '../utils/toonShader';
import { BoxCollider2D } from '../utils/collision';
import { LivingRoomAnchors } from './HouseMapScene';

export type DadAnimState = 'WORK' | 'WALK' | 'SIT_DOWN' | 'SIT_IDLE' | 'YELL' | 'RUN';

/**
 * Checks a line segment (p1 -> p2) against a 2D box collider [minX, maxX] x [minZ, maxZ].
 * Returns the minimum distance from the segment to the box.
 */
export function segmentBoxDistance(
  x1: number, z1: number,
  x2: number, z2: number,
  minX: number, maxX: number,
  minZ: number, maxZ: number
): number {
  const steps = 24;
  let minDist = Infinity;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const pz = z1 + (z2 - z1) * t;
    const dx = Math.max(0, Math.max(minX - px, px - maxX));
    const dz = Math.max(0, Math.max(minZ - pz, pz - maxZ));
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * Checks each segment of the path against room colliders with minClearance (0.8m)
 * and reroutes around any collider that violates clearance.
 */
export function checkAndReroutePath(
  waypoints: THREE.Vector3[],
  colliders: BoxCollider2D[],
  minClearance: number = 0.8
): THREE.Vector3[] {
  if (waypoints.length < 2) return waypoints;
  const result: THREE.Vector3[] = [waypoints[0].clone()];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = result[result.length - 1];
    const p2 = waypoints[i + 1];

    let offendingCol: BoxCollider2D | null = null;
    let worstDist = Infinity;

    for (const col of colliders) {
      if (col.id.includes('door') || col.id.includes('dad') || col.id === 'zone_stairs_debug') continue;
      const d = segmentBoxDistance(p1.x, p1.z, p2.x, p2.z, col.minX, col.maxX, col.minZ, col.maxZ);
      if (d < minClearance && d < worstDist) {
        worstDist = d;
        offendingCol = col;
      }
    }

    if (offendingCol) {
      // Reroute around offending collider staying at least minClearance away
      const pad = minClearance + 0.1;
      const midZ = (offendingCol.minZ + offendingCol.maxZ) / 2;
      const midX = (offendingCol.minX + offendingCol.maxX) / 2;
      const detourZ = p1.z >= midZ ? offendingCol.maxZ + pad : offendingCol.minZ - pad;
      const detourX = p1.x >= midX ? offendingCol.maxX + pad : offendingCol.minX - pad;

      result.push(new THREE.Vector3(detourX, 0, detourZ));
    }

    result.push(p2.clone());
  }

  return result;
}

export class DadCharacter {
  public group: THREE.Group;
  public modelGroup: THREE.Group;
  public placeholderGroup: THREE.Group | null = null;

  public mixer: THREE.AnimationMixer | null = null;
  public actions: Record<string, THREE.AnimationAction> = {};
  public currentAction: THREE.AnimationAction | null = null;
  public currentState: DadAnimState = 'WORK';
  public previousState: DadAnimState = 'WORK';
  public isSeated: boolean = false;
  public isLoaded: boolean = false;
  public isStateLocked: boolean = false;

  // Workshop standing spot (standing at workbench, back to the door)
  public static readonly WORKSHOP_BENCH_POS = new THREE.Vector3(-6.4, 0, 7.5);
  public static readonly WORKSHOP_BENCH_ROT_Y = -Math.PI / 2;

  // Living room sofa spot for sitdown / sitidle (hips on cushion, feet on floor, facing TV)
  public static readonly LIVING_ROOM_SOFA_POS = new THREE.Vector3(6.45, 0, 16.5);
  public static LIVING_ROOM_SOFA_ROT_Y = -Math.PI / 2;

  // Explicit computed anchors
  public sofaSeatAnchor = {
    position: new THREE.Vector3(6.45, 0, 16.5),
    rotationY: -Math.PI / 2,
    facingDir: new THREE.Vector3(-1, 0, 0),
  };
  public baseSofaSeatPos: THREE.Vector3 = new THREE.Vector3(6.45, 0, 16.5);
  public baseSofaSeatRotY: number = -Math.PI / 2;
  public seatOffset = { x: 0, y: 0, z: 0, rotY: 0 };
  public sofaApproachPoint: THREE.Vector3 = new THREE.Vector3(5.25, 0, 18.5);
  public tvStandCollider: BoxCollider2D | null = null;

  // Waypoints list from workshop to sofaApproachPoint
  public waypoints: THREE.Vector3[] = [];
  public static WAYPOINTS: THREE.Vector3[] = [];

  // Smooth sitting down transition state
  public isSittingDownTransition: boolean = false;
  public sitTransitionTimer: number = 0;
  public sitDownDuration: number = 2.2;
  public sitStartPos: THREE.Vector3 = new THREE.Vector3();
  public faceSofaRotY: number = 0;

  public isWalking: boolean = false;
  public currentWaypointIndex: number = 0;
  public walkSpeed: number = 1.4; // 1.4 units per second
  public walkClipAuthoredSpeed: number = 1.35; // Authoring speed of walk clip
  public forwardOffset: number = 0; // Model forward rotation offset (flip by Math.PI if backward)
  public onSeatedCallback: (() => void) | null = null;
  public doorCheckCallback: ((doorwayCenter: THREE.Vector3) => { isClosed: boolean; openDoor: () => void } | null) | null = null;
  private isDoorPaused: boolean = false;

  // Standing collider (only present while standing/working, removed when walking or seated)
  private standingCollider: BoxCollider2D = {
    id: 'dad_standing_collider',
    name: 'Dad',
    minX: -6.9,
    maxX: -5.9,
    minZ: 7.0,
    maxZ: 8.0,
    height: 2.0,
  };

  private breathingTime: number = 0;
  private blendDuration: number = 0.3; // smooth blending

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'DadCharacter';
    this.group.visible = true;

    this.modelGroup = new THREE.Group();
    this.modelGroup.name = 'DadModelGroup';
    this.modelGroup.visible = true;
    this.group.add(this.modelGroup);

    // Initial position: standing on workshop floor at the workbench position
    this.group.position.copy(DadCharacter.WORKSHOP_BENCH_POS);
    this.group.rotation.y = DadCharacter.WORKSHOP_BENCH_ROT_Y;

    // Visible fallback placeholder immediately
    this.createPlaceholder();

    // Start loading real model and clips
    this.loadAssets();
  }

  /**
   * Builds a stylized toon-shaded placeholder figure (capsule body + sphere head)
   * exactly 1.9 units tall, standing with feet on the floor at Y = 0.
   * Visible while loading or if loading fails.
   */
  private createPlaceholder() {
    this.placeholderGroup = new THREE.Group();
    this.placeholderGroup.name = 'DadPlaceholder';

    // Dad's denim blue workshirt toon material
    const bodyMat = createToonMaterial({
      color: 0x3b82f6,
      desaturate: 0.15,
    });
    // Toon skin tone
    const skinMat = createToonMaterial({
      color: 0xf59e0b,
      desaturate: 0.1,
    });
    // Dark brown work pants / shoes
    const pantsMat = createToonMaterial({
      color: 0x475569,
      desaturate: 0.1,
    });

    // Torso & Upper Legs: Capsule (radius: 0.26, length: 0.85)
    // Sits from Y = 0.40 to Y = 1.50
    const bodyGeo = new THREE.CapsuleGeometry(0.26, 0.85, 8, 16);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.95;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    bodyMesh.frustumCulled = false;

    // Legs base / Boots (Y = 0.0 to 0.45)
    const legGeo = new THREE.CylinderGeometry(0.20, 0.22, 0.45, 12);
    const legMesh = new THREE.Mesh(legGeo, pantsMat);
    legMesh.position.y = 0.225;
    legMesh.castShadow = true;
    legMesh.receiveShadow = true;
    legMesh.frustumCulled = false;

    // Head: Sphere (radius: 0.21) centered at Y = 1.68
    const headGeo = new THREE.SphereGeometry(0.21, 16, 16);
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.position.y = 1.68;
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    headMesh.frustumCulled = false;

    this.placeholderGroup.add(legMesh, bodyMesh, headMesh);
    this.placeholderGroup.position.set(0, 0, 0);
    this.group.add(this.placeholderGroup);
  }

  /**
   * Returns Dad's standing collider if he is standing at workbench, or null if walking or seated.
   * Requirement 5: Remove standing collider once seated, and keep him out of player's way while walking.
   */
  public getCollider(): BoxCollider2D | null {
    if (this.isSeated || this.currentState === 'SIT_DOWN' || this.currentState === 'SIT_IDLE' || this.isStateLocked) {
      return null;
    }
    if (this.currentState === 'WALK' || this.isWalking) {
      return null;
    }
    return this.standingCollider;
  }

  private async loadAssets() {
    const clipNames = ['dad_walk', 'dad_sitdown', 'dad_sitidle', 'dad_yell', 'dad_work', 'run'];
    try {
      const loader = new GLTFLoader();
      const loadedGltfs: Record<string, any> = {};

      // Load clips in parallel for faster loading
      const results = await Promise.all(
        clipNames.map(async (name) => {
          try {
            const res = await loadGltfWithFallback(loader, name);
            return { name, gltf: res?.gltf };
          } catch (err) {
            return { name, gltf: null };
          }
        })
      );

      for (const r of results) {
        if (r.gltf) {
          loadedGltfs[r.name] = r.gltf;
        }
      }

      // Pick base model scene: try dad_walk, dad_work, dad_sitidle, dad_sitdown, dad_yell
      let baseGltf =
        loadedGltfs['dad_walk'] ||
        loadedGltfs['dad_work'] ||
        loadedGltfs['dad_sitidle'] ||
        loadedGltfs['dad_sitdown'] ||
        loadedGltfs['dad_yell'];

      if (!baseGltf) {
        console.warn('[DadCharacter] No Dad GLTF files could be loaded. Retaining visible placeholder figure.');
        this.logDadDebugStatus();
        return;
      }

      const model = baseGltf.scene;

      // Apply Toon Shading matching Zane, enable shadows, and ensure frustumCulled is false on all meshes
      model.traverse((child: THREE.Object3D) => {
        child.frustumCulled = false;
        if ((child as THREE.Mesh).isMesh || (child as any).isSkinnedMesh) {
          const mesh = child as THREE.Mesh;
          mesh.frustumCulled = false;
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          if (mesh.material) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const newMats = mats.map((m) => {
              const origColor = (m as any).color ? (m as any).color.getHex() : 0x78716c;
              const toonMat = createToonMaterial({
                color: origColor,
                desaturate: 0.18,
                side: THREE.DoubleSide,
              });
              if ((m as any).map) {
                toonMat.map = (m as any).map;
              }
              return toonMat;
            });
            mesh.material = Array.isArray(mesh.material) ? newMats : newMats[0];
          }
        }
      });

      // Requirement 2: Compute scale from bounding box instead of assuming it, giving about 1.9 units of height
      model.updateMatrixWorld(true);
      const rawBox = new THREE.Box3().setFromObject(model);
      const rawSize = new THREE.Vector3();
      rawBox.getSize(rawSize);

      const targetHeight = 1.9;
      if (rawSize.y > 0.001) {
        const scaleFactor = targetHeight / rawSize.y;
        model.scale.setScalar(scaleFactor);
      } else {
        model.scale.setScalar(0.019); // 1/100 default fallback for Mixamo cm scale
      }

      // Recompute bounding box with applied scale and place feet on the floor (Y = 0)
      model.updateMatrixWorld(true);
      const scaledBox = new THREE.Box3().setFromObject(model);
      model.position.y = -scaledBox.min.y;
      model.position.x = -(scaledBox.min.x + scaledBox.max.x) / 2;
      model.position.z = -(scaledBox.min.z + scaledBox.max.z) / 2;
      model.updateMatrixWorld(true);

      this.modelGroup.add(model);

      // Requirement 3: Remove placeholder only once the real model has loaded
      if (this.placeholderGroup) {
        this.group.remove(this.placeholderGroup);
        this.placeholderGroup = null;
      }

      // Create AnimationMixer with 0.3s blend capability
      const mixer = new THREE.AnimationMixer(model);
      this.mixer = mixer;

      // Extract and register clips
      const clipMap: Record<string, THREE.AnimationClip | null> = {
        WORK: this.findFirstClip(loadedGltfs['dad_work']),
        WALK: this.findFirstClip(loadedGltfs['dad_walk']),
        SIT_DOWN: this.findFirstClip(loadedGltfs['dad_sitdown']),
        SIT_IDLE: this.findFirstClip(loadedGltfs['dad_sitidle']),
        YELL: this.findFirstClip(loadedGltfs['dad_yell']),
        RUN: this.findFirstClip(loadedGltfs['run']) || this.findFirstClip(loadedGltfs['dad_walk']),
      };

      for (const [stateName, rawClip] of Object.entries(clipMap)) {
        if (rawClip) {
          // Requirement 3: Make sure the clip's root position tracks are stripped so it plays in place
          let clipToUse = rawClip;
          if (stateName === 'WALK' || stateName === 'RUN') {
            clipToUse = stripRootMotion(rawClip);
          }
          clipToUse.name = stateName;
          const action = mixer.clipAction(clipToUse);

          if (stateName === 'WALK') {
            action.loop = THREE.LoopRepeat;
            action.setEffectiveWeight(1.0);
            action.setEffectiveTimeScale(this.walkSpeed / this.walkClipAuthoredSpeed);
          } else if (stateName === 'RUN') {
            action.loop = THREE.LoopRepeat;
            action.setEffectiveWeight(1.0);
            action.setEffectiveTimeScale(1.8);
          } else if (stateName === 'SIT_DOWN') {
            // Requirement 4: play SIT_DOWN once (LoopOnce, clampWhenFinished = true)
            action.loop = THREE.LoopOnce;
            action.clampWhenFinished = true;
          } else if (stateName === 'YELL') {
            action.loop = THREE.LoopOnce;
            action.clampWhenFinished = true;
          } else {
            action.loop = THREE.LoopRepeat;
          }

          this.actions[stateName] = action;
        }
      }

      // Handle SIT_DOWN and YELL completion events
      mixer.addEventListener('finished', (e: any) => {
        if (e.action === this.actions['SIT_DOWN']) {
          this.isSittingDownTransition = false;
          this.group.position.copy(this.sofaSeatAnchor.position);
          this.group.rotation.y = this.sofaSeatAnchor.rotationY;
          this.isSeated = true;
          this.isStateLocked = true;
          this.playState('SIT_IDLE', 0.3);
          this.onSeatedCallback?.();
        } else if (e.action === this.actions['YELL']) {
          if (this.isSeated) {
            this.playState('SIT_IDLE', 0.3);
          } else {
            this.playState(this.previousState || 'WORK', 0.3);
          }
        }
      });

      this.isLoaded = true;

      // Start in WORK state
      this.playState('WORK', 0.1);

      // Requirement 1: Log detailed load status to console
      this.logDadDebugStatus();
    } catch (err) {
      console.warn('[DadCharacter] Unexpected error loading Dad assets:', err);
      this.logDadDebugStatus();
    }
  }

  private findFirstClip(gltf: any): THREE.AnimationClip | null {
    if (gltf && gltf.animations && gltf.animations.length > 0) {
      return gltf.animations[0];
    }
    return null;
  }

  /**
   * Requirement 1: Comprehensive console logger for Dad character
   */
  public logDadDebugStatus() {
    console.group('[Dad Character Diagnostics]');

    console.log('--- 1. FILES LOAD STATUS ---');
    const files = ['dad_walk', 'dad_sitdown', 'dad_sitidle', 'dad_yell', 'dad_work'];
    files.forEach((file) => {
      const info = getClipStatus(file);
      if (info?.status === 'loaded') {
        console.log(`✓ [LOADED] ${file}: source = ${info.resolvedUrl || info.resolvedFile}`);
      } else if (info?.status === 'failed') {
        console.warn(`✗ [FAILED] ${file}:`, info.error || 'Unknown error', 'Attempts:', info.attempts);
      } else {
        console.log(`⏳ [${info?.status?.toUpperCase() || 'PENDING'}] ${file}`);
      }
    });

    console.log('--- 2. SCENE & TRANSFORM STATUS ---');
    console.log('Added to Scene:', this.group.parent !== null);
    console.log('Group Visible Flag:', this.group.visible);

    const worldPos = new THREE.Vector3();
    this.group.getWorldPosition(worldPos);
    console.log('World Position:', `X=${worldPos.x.toFixed(2)}, Y=${worldPos.y.toFixed(2)}, Z=${worldPos.z.toFixed(2)}`);
    console.log('Group Scale:', this.group.scale);
    console.log('ModelGroup Scale:', this.modelGroup.scale);

    this.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.group);
    const size = new THREE.Vector3();
    box.getSize(size);
    console.log(
      'Bounding Box Size:',
      `Width(X)=${size.x.toFixed(2)}, Height(Y)=${size.y.toFixed(2)}, Depth(Z)=${size.z.toFixed(2)}`
    );
    console.log('Bounding Box Min Y (Floor Alignment):', box.min.y.toFixed(3));
    console.log('Is Real Model Loaded:', this.isLoaded, '| Placeholder Active:', this.placeholderGroup !== null);

    console.groupEnd();
  }

  /**
   * Switch animation state with smooth crossfade blending.
   * Requirement 4: Use a single state machine with the guard
   * "if state is SIT_IDLE, ignore SIT_DOWN and WALK requests"
   */
  public playState(nextState: DadAnimState, blendTime: number = 0.3) {
    // Single state machine guard: if state is SIT_IDLE, ignore SIT_DOWN and WALK requests
    if (this.currentState === 'SIT_IDLE') {
      if (nextState === 'SIT_DOWN' || nextState === 'WALK' || nextState === 'WORK') {
        return;
      }
    }

    // LOCK the state: after that, never replay SIT_DOWN or any stand-up clip,
    // and ignore every call that tries to change his state until the beer scene needs YELL.
    if (this.isStateLocked && nextState !== 'YELL' && nextState !== 'SIT_IDLE') {
      return;
    }

    this.previousState = this.currentState;
    this.currentState = nextState;
    this.blendDuration = blendTime;

    if (!this.mixer) return;

    const nextAction = this.actions[nextState];

    if (!nextAction) {
      if (nextState === 'WORK') {
        // Fallback: if dad_work is not available, hold first frame of dad_walk or freeze in place
        const walkAction = this.actions['WALK'];
        if (walkAction) {
          walkAction.reset();
          walkAction.setEffectiveTimeScale(0); // freeze first frame
          walkAction.play();
          if (this.currentAction && this.currentAction !== walkAction) {
            this.currentAction.crossFadeTo(walkAction, blendTime, true);
          }
          this.currentAction = walkAction;
        }
      }
      return;
    }

    if (this.currentAction === nextAction) return;

    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setEffectiveWeight(1.0);

    if (nextState === 'WALK') {
      // Requirement 3: play WALK clip looping at full weight, crossfaded in over 0.2s,
      // timeScale = speed / authored speed, speed about 1.4 units per second
      const timeScale = this.walkSpeed / this.walkClipAuthoredSpeed;
      nextAction.setEffectiveTimeScale(timeScale);
      nextAction.loop = THREE.LoopRepeat;
      blendTime = 0.2;
    } else if (nextState === 'SIT_DOWN') {
      // Requirement 4: play SIT_DOWN once (LoopOnce, clampWhenFinished = true)
      nextAction.setEffectiveTimeScale(1.0);
      nextAction.loop = THREE.LoopOnce;
      nextAction.clampWhenFinished = true;
    } else if (nextState === 'RUN') {
      nextAction.setEffectiveTimeScale(1.8);
      nextAction.loop = THREE.LoopRepeat;
      blendTime = 0.2;
    } else if (nextState === 'YELL') {
      nextAction.setEffectiveTimeScale(1.0);
      nextAction.loop = THREE.LoopOnce;
      nextAction.clampWhenFinished = true;
    } else {
      nextAction.setEffectiveTimeScale(1.0);
      nextAction.loop = THREE.LoopRepeat;
    }

    if (this.currentAction) {
      this.currentAction.crossFadeTo(nextAction, blendTime, true);
    }
    nextAction.play();
    this.currentAction = nextAction;
  }

  public hasAnimation(name: string): boolean {
    return Boolean(this.actions[name]);
  }

  /**
   * Forces an animation state change regardless of SIT_IDLE locks, specifically for cutscenes.
   */
  public forcePlayState(nextState: DadAnimState, blendTime: number = 0.2, timeScale?: number) {
    this.forceState(nextState, blendTime);
  }

  /**
   * Clears the seated lock and plays the specified state.
   * If state is SIT_IDLE, re-locks the seated state.
   */
  public forceState(nextState: DadAnimState, fade: number = 0.25) {
    this.isStateLocked = false;
    this.isSittingDownTransition = false;
    this.isWalking = false;

    if (nextState === 'SIT_IDLE') {
      this.isSeated = true;
      this.currentState = 'SIT_IDLE';
      this.playState('SIT_IDLE', fade);
      this.isStateLocked = true;
    } else {
      this.isSeated = false;
      if (this.currentState === 'SIT_IDLE') {
        this.currentState = 'WORK'; // bypass the SIT_IDLE guard in playState
      }
      this.playState(nextState, fade);
    }
  }

  public getAnimInfo() {
    const clipName = this.currentAction?.getClip().name || this.currentState;
    return {
      currentAnimName: clipName,
      mixerTime: this.mixer?.time ?? 0,
      isClipLoaded: Boolean(this.currentAction),
    };
  }


  public run() {
    this.isSeated = false;
    this.playState('RUN', 0.2);
  }

  public walk() {
    if (this.currentState === 'SIT_IDLE' || this.isStateLocked) return;
    this.isSeated = false;
    this.playState('WALK', 0.2);
  }

  public work() {
    if (this.currentState === 'SIT_IDLE' || this.isStateLocked) return;
    this.isSeated = false;
    this.playState('WORK', 0.3);
  }

  public yell() {
    this.playState('YELL', 0.25);
  }

  public setLivingRoomAnchors(anchors: LivingRoomAnchors, roomColliders?: BoxCollider2D[]) {
    this.baseSofaSeatPos.copy(anchors.sofaSeatAnchor.position);
    this.baseSofaSeatRotY = anchors.sofaSeatAnchor.rotationY;

    this.sofaSeatAnchor = {
      position: anchors.sofaSeatAnchor.position.clone(),
      rotationY: anchors.sofaSeatAnchor.rotationY,
      facingDir: anchors.sofaSeatAnchor.facingDir.clone(),
    };
    this.sofaApproachPoint.copy(anchors.sofaApproachPoint);
    this.tvStandCollider = anchors.tvStandCollider;

    // Apply any active tuning offset
    this.sofaSeatAnchor.position.x += this.seatOffset.x;
    this.sofaSeatAnchor.position.y += this.seatOffset.y;
    this.sofaSeatAnchor.position.z += this.seatOffset.z;
    this.sofaSeatAnchor.rotationY += this.seatOffset.rotY;

    DadCharacter.LIVING_ROOM_SOFA_POS.copy(this.sofaSeatAnchor.position);
    DadCharacter.LIVING_ROOM_SOFA_ROT_Y = this.sofaSeatAnchor.rotationY;

    // Requirement 2:
    // Dad's waypoint path to the sofa must come from the doorway to the sofaApproachPoint
    // staying at least 0.8 units away from the TV stand, coffee table and any other collider,
    // then step to the seat. Never cross the TV stand. Check each segment of the path
    // against the room's colliders and reroute around them.
    const approachZ = this.sofaApproachPoint.z;
    const rawWaypoints: THREE.Vector3[] = [
      new THREE.Vector3(-6.4, 0, 7.5),      // 0. Workshop workbench
      new THREE.Vector3(-6.4, 0, 8.9),      // 1. South into clear workshop floor
      new THREE.Vector3(-2.8, 0, 8.9),      // 2. East past central work table
      new THREE.Vector3(-2.8, 0, 7.5),      // 3. 1 unit before workshop doorway
      new THREE.Vector3(-1.8, 0, 7.5),      // 4. Workshop door CENTER
      new THREE.Vector3(-0.8, 0, 7.5),      // 5. 1 unit after workshop doorway
      new THREE.Vector3(0.0, 0, 7.5),       // 6. Hallway center line
      new THREE.Vector3(0.0, 0, approachZ), // 7. Hallway center line south past TV stand (staying >= 0.8 from TV stand)
      new THREE.Vector3(1.8, 0, approachZ), // 8. Doorway to living room
      this.sofaApproachPoint.clone(),       // 9. sofaApproachPoint on floor 1.2 units in front of sofa
    ];

    const allColliders = roomColliders ? [...roomColliders] : [];
    if (this.tvStandCollider && !allColliders.some(c => c.id === this.tvStandCollider?.id)) {
      allColliders.push(this.tvStandCollider);
    }
    if (anchors.coffeeTableCollider && !allColliders.some(c => c.id === anchors.coffeeTableCollider.id)) {
      allColliders.push(anchors.coffeeTableCollider);
    }
    if (anchors.sofaCollider && !allColliders.some(c => c.id === anchors.sofaCollider.id)) {
      allColliders.push(anchors.sofaCollider);
    }

    this.waypoints = checkAndReroutePath(rawWaypoints, allColliders, 0.8);
    DadCharacter.WAYPOINTS = this.waypoints;
  }

  public updateSeatOffset(offset: { x: number; y: number; z: number; rotY: number }) {
    this.seatOffset = { ...offset };
    this.sofaSeatAnchor.position.set(
      this.baseSofaSeatPos.x + offset.x,
      this.baseSofaSeatPos.y + offset.y,
      this.baseSofaSeatPos.z + offset.z
    );
    this.sofaSeatAnchor.rotationY = this.baseSofaSeatRotY + offset.rotY;

    DadCharacter.LIVING_ROOM_SOFA_POS.copy(this.sofaSeatAnchor.position);
    DadCharacter.LIVING_ROOM_SOFA_ROT_Y = this.sofaSeatAnchor.rotationY;

    // Move Dad live if seated or currently sitting
    if (this.isSeated || this.currentState === 'SIT_IDLE' || this.currentState === 'SIT_DOWN') {
      this.group.position.copy(this.sofaSeatAnchor.position);
      this.group.rotation.y = this.sofaSeatAnchor.rotationY;
    }
  }

  public sitDown() {
    if (this.currentState === 'SIT_IDLE' || this.isStateLocked) return;
    this.isSeated = true;
    this.group.position.copy(this.sofaSeatAnchor.position);
    this.group.rotation.y = this.sofaSeatAnchor.rotationY;
    this.playState('SIT_DOWN', 0.2);
  }

  public sitIdle() {
    this.isSeated = true;
    this.isStateLocked = true;
    this.group.position.copy(this.sofaSeatAnchor.position);
    this.group.rotation.y = this.sofaSeatAnchor.rotationY;
    this.playState('SIT_IDLE', 0.3);
  }

  /**
   * Starts walking from workshop to living room sofa along verified waypoints
   */
  public startWalkToSofa(onArrived?: () => void) {
    if (this.currentState === 'SIT_IDLE' || this.isStateLocked) return;
    this.isWalking = true;
    this.isSeated = false;
    this.isSittingDownTransition = false;
    this.currentWaypointIndex = 1; // target first waypoint after workshop workbench
    this.onSeatedCallback = onArrived || null;
    this.playState('WALK', 0.2);
  }

  /**
   * Starts the smooth sit-down transition once Dad reaches sofaApproachPoint:
   * Turns to face the sofa, plays SIT_DOWN once, and smoothly moves root position
   * to sofaSeatAnchor (settling onto the cushion), then SIT_IDLE looping.
   */
  public startSofaSitTransition() {
    this.isWalking = false;
    this.isSittingDownTransition = true;
    this.sitTransitionTimer = 0;
    this.sitStartPos.copy(this.group.position);

    // 1. Turn to face the sofa
    const toSofa = new THREE.Vector3().subVectors(this.sofaSeatAnchor.position, this.group.position);
    toSofa.y = 0;
    if (toSofa.lengthSq() > 0.001) {
      toSofa.normalize();
      this.faceSofaRotY = Math.atan2(toSofa.x, toSofa.z);
    } else {
      this.faceSofaRotY = this.sofaSeatAnchor.rotationY + Math.PI;
    }
    this.group.rotation.y = this.faceSofaRotY;

    // 2. Play SIT_DOWN once
    this.playState('SIT_DOWN', 0.2);

    const clipDuration = this.actions['SIT_DOWN']?.getClip()?.duration;
    this.sitDownDuration = (clipDuration && clipDuration > 0.5) ? clipDuration : 2.2;
  }

  /**
   * Updates waypoint navigation, smooth facing, door checks, and arrival sitting
   */
  public updateNavigation(
    delta: number,
    checkDoor?: (doorwayCenter: THREE.Vector3) => { isClosed: boolean; openDoor: () => void } | null
  ) {
    if (!this.isWalking) return;

    const waypoints = this.waypoints.length > 0 ? this.waypoints : DadCharacter.WAYPOINTS;
    if (this.currentWaypointIndex >= waypoints.length) {
      this.isWalking = false;
      this.startSofaSitTransition();
      return;
    }

    const targetWp = waypoints[this.currentWaypointIndex];

    // Check if approaching workshop door center (-1.8, 0, 7.5) from waypoint 3 (-2.8, 0, 7.5)
    const doorChecker = checkDoor || this.doorCheckCallback;
    if (doorChecker && this.currentWaypointIndex === 4) {
      const doorInfo = doorChecker(targetWp);
      if (doorInfo && doorInfo.isClosed) {
        this.isDoorPaused = true;
        doorInfo.openDoor();
        return; // Pause while door opens
      } else {
        this.isDoorPaused = false;
      }
    }

    const curPos = this.group.position;
    const moveVec = new THREE.Vector3().subVectors(targetWp, curPos);
    moveVec.y = 0;
    const dist = moveVec.length();

    if (dist < 0.001) {
      this.advanceWaypoint();
      return;
    }

    const dir = moveVec.clone().normalize();

    // Turn smoothly toward the direction he is moving
    const targetRot = Math.atan2(dir.x, dir.z) + this.forwardOffset;
    let angleDiff = targetRot - this.group.rotation.y;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    const rotSpeed = Math.min(1.0, delta / 0.15);
    this.group.rotation.y += angleDiff * rotSpeed;

    const step = this.walkSpeed * delta;
    if (step >= dist) {
      curPos.copy(targetWp);
      this.advanceWaypoint();
    } else {
      curPos.addScaledVector(dir, step);
    }
  }

  private advanceWaypoint() {
    this.currentWaypointIndex++;
    const waypoints = this.waypoints.length > 0 ? this.waypoints : DadCharacter.WAYPOINTS;
    if (this.currentWaypointIndex >= waypoints.length) {
      // Reached sofaApproachPoint!
      this.isWalking = false;
      this.startSofaSitTransition();
    }
  }

  /**
   * Updates AnimationMixer, waypoint navigation, smooth sitting down transition, and subtle breathing
   */
  public update(delta: number) {
    if (this.mixer) {
      this.mixer.update(delta);
    }

    if (this.isWalking) {
      this.updateNavigation(delta, this.doorCheckCallback || undefined);
    }

    // Requirement 3: When he reaches the approach point, turn to face the sofa,
    // play SIT_DOWN once while smoothly moving his root position to the sofaSeatAnchor
    // (so he settles onto the cushion), then SIT_IDLE looping, with his feet on the floor,
    // his back against the sofa back, and his facing toward the TV.
    if (this.isSittingDownTransition) {
      this.sitTransitionTimer += delta;
      const progress = Math.min(1.0, this.sitTransitionTimer / this.sitDownDuration);

      // Smooth easing (smoothstep) so he smoothly settles onto the cushion
      const t = progress * progress * (3 - 2 * progress);

      // Smoothly move root position to sofaSeatAnchor.position
      this.group.position.lerpVectors(this.sitStartPos, this.sofaSeatAnchor.position, t);

      // Smoothly rotate facing to face toward the TV (sofaSeatAnchor.rotationY)
      let diff = this.sofaSeatAnchor.rotationY - this.faceSofaRotY;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.group.rotation.y = this.faceSofaRotY + diff * t;

      if (progress >= 1.0) {
        this.isSittingDownTransition = false;
        this.group.position.copy(this.sofaSeatAnchor.position);
        this.group.rotation.y = this.sofaSeatAnchor.rotationY;
        this.isSeated = true;
        this.isStateLocked = true; // "sit once and stay" guard
        this.playState('SIT_IDLE', 0.3);
        this.onSeatedCallback?.();
      }
    }

    // Ensure skinned mesh is not frozen (frustumCulled false)
    if (this.modelGroup) {
      this.modelGroup.traverse((child) => {
        child.frustumCulled = false;
      });
    }

    // Subtle breathing motion when in WORK state
    if (this.currentState === 'WORK') {
      this.breathingTime += delta * 2.2;
      const breath = Math.sin(this.breathingTime) * 0.008;
      this.modelGroup.position.y = breath;
    } else if (this.modelGroup.position.y !== 0) {
      this.modelGroup.position.y = 0;
    }
  }
}
