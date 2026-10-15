import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadGltfWithFallback, stripRootMotion } from '../utils/assetLoader';

export type CharacterAnimState =
  | 'IDLE'
  | 'RUN'
  | 'DUCK'
  | 'DIVE'
  | 'SLIDE'
  | 'FLINCH'
  | 'RAISE_WEAPON'
  | 'TALK'
  | 'FALL'
  | 'INJURED_WALK'
  | 'Run'
  | 'Crouch'
  | 'Dive'
  | 'Talk'
  | 'Flinch'
  | 'Fall'
  | 'InjuredWalk';

interface AdditionalClipDef {
  fileBase: string;
  name: string;
  isOnce?: boolean;
}

const ADDITIONAL_CLIPS: AdditionalClipDef[] = [
  { fileBase: 'crouch', name: 'Crouch' },
  { fileBase: 'dive', name: 'Dive' },
  { fileBase: 'talk', name: 'Talk' },
  { fileBase: 'flinch', name: 'Flinch' },
  { fileBase: 'ty_fall', name: 'Fall', isOnce: true },
  { fileBase: 'ty_injured_walk', name: 'InjuredWalk' },
];

export class CharacterModel {
  // Speed the run clip was authored for in units per second (stride calibration)
  public static readonly AUTHORED_RUN_SPEED: number = 4.0;

  public group: THREE.Group;
  public modelGroup: THREE.Group;
  public head: THREE.Group;
  public body: THREE.Group;

  // Animation State & Mixer
  public currentState: string = 'IDLE';
  public targetState: string = 'IDLE';
  public animTime: number = 0;
  public blendDuration: number = 0.25; // 0.2 to 0.3s smooth movement blending

  // Injured / Hurt state & Falling
  public isHurt: boolean = false;
  public isLyingDown: boolean = false;

  private mixer: THREE.AnimationMixer | null = null;
  private actions: Record<string, THREE.AnimationAction> = {};
  private currentAction: THREE.AnimationAction | null = null;
  private activeAnimName: string = 'Talk';
  public isLoaded: boolean = false;
  private isCombatMode: boolean = false;
  private pendingAnimation: { name: string; blendTime: number; speed: number } | null = null;
  public headTiltTimer: number = 0;

  public tiltHead(duration: number = 0.6) {
    this.headTiltTimer = duration;
  }

  public setHurt(hurt: boolean) {
    this.isHurt = hurt;
  }

  public fall() {
    this.isLyingDown = true;
    this.playAnimation('FALL', 0.25, 1.0);
  }

  public standUp() {
    this.isLyingDown = false;
    this.playAnimation('IDLE', 0.3, 1.0);
  }

  constructor() {
    this.group = new THREE.Group();
    this.modelGroup = new THREE.Group();
    this.group.add(this.modelGroup);

    this.head = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.head);
    this.group.add(this.body);

    // Initialize loading the real 3D GLTF character model and clips
    this.loadCharacterAssets();
  }

  /**
   * Loads the real GLTF model and all animation clips using GLTFLoader
   * Wrapped in try/catch so failure never prevents scene rendering
   */
  private async loadCharacterAssets() {
    try {
      const loader = new GLTFLoader();

      // Step A: Load base character model from 'run' using fallback loader
      const baseResult = await loadGltfWithFallback(loader, 'run');
      if (!baseResult || !baseResult.gltf) {
        console.warn('[CharacterModel] Could not load base run model.');
        return;
      }

      const baseGltf = baseResult.gltf;
      const model = baseGltf.scene;

      // Enable shadows on all meshes and keep original textures & colors
      model.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
        }
      });

      // Step B: Automatically scale model to about 1.8 units tall and place feet on floor (y = 0)
      const initialBox = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      initialBox.getSize(size);

      if (size.y > 0) {
        const targetHeight = 1.8;
        const scaleFactor = targetHeight / size.y;
        model.scale.setScalar(scaleFactor);
      }

      // Update matrices and re-compute bounding box with scaled dimensions
      model.updateMatrixWorld(true);
      const scaledBox = new THREE.Box3().setFromObject(model);

      // Place feet on floor (y = 0) and center on X and Z
      model.position.y = -scaledBox.min.y;
      model.position.x = -(scaledBox.min.x + scaledBox.max.x) / 2;
      model.position.z = -(scaledBox.min.z + scaledBox.max.z) / 2;

      this.modelGroup.add(model);

      // Setup AnimationMixer
      const mixer = new THREE.AnimationMixer(model);
      this.mixer = mixer;

      // Step C: Load and register animations
      // 1) First animation from base model (Run)
      if (baseGltf.animations && baseGltf.animations.length > 0) {
        const runClip = stripRootMotion(baseGltf.animations[0]);
        runClip.name = 'Run';
        const runAction = mixer.clipAction(runClip);
        runAction.loop = THREE.LoopRepeat;
        this.actions['Run'] = runAction;
      }

      // 2) Load remaining animation files in parallel (crouch, dive, talk, flinch, ty_fall, ty_injured_walk)
      await Promise.all(
        ADDITIONAL_CLIPS.map(async (anim) => {
          try {
            const res = await loadGltfWithFallback(loader, anim.fileBase);
            if (res && res.gltf && res.gltf.animations && res.gltf.animations.length > 0) {
              const clip = stripRootMotion(res.gltf.animations[0]);
              clip.name = anim.name;
              const action = mixer.clipAction(clip);
              if (anim.isOnce) {
                action.loop = THREE.LoopOnce;
                action.clampWhenFinished = true;
              } else {
                action.loop = THREE.LoopRepeat;
              }
              this.actions[anim.name] = action;
            }
          } catch (err) {
            console.warn(`[CharacterModel] Failed to register animation clip ${anim.name}:`, err);
          }
        })
      );

      // Add mixer finished listener for once-off clips (e.g. Fall clamp)
      mixer.addEventListener('finished', (e: any) => {
        if (e.action === this.actions['Fall']) {
          this.isLyingDown = true;
        }
      });

      this.isLoaded = true;

      // Default initial animation or pending action
      if (this.pendingAnimation) {
        this.switchAnimation(
          this.pendingAnimation.name,
          this.pendingAnimation.blendTime,
          this.pendingAnimation.speed
        );
      } else {
        const targetClip = this.mapStateToClipName(this.targetState);
        this.switchAnimation(targetClip, 0.25, 1.0);
      }
    } catch (err) {
      console.warn('Failed to load real character GLTF model:', err);
    }
  }

  /**
   * Maps existing character states to animation clip names:
   * - Run for sprints
   * - Crouch when ducking
   * - Dive for dives
   * - Flinch when an explosion hits
   * - Talk during dialogue / idle
   * - Fall for falling / lying down
   * - InjuredWalk for walking while hurt
   */
  private mapStateToClipName(state: string): string {
    switch (state.toUpperCase()) {
      case 'RUN':
        return 'Run';
      case 'DUCK':
      case 'CROUCH':
      case 'SLIDE':
        return 'Crouch';
      case 'DIVE':
        return 'Dive';
      case 'FLINCH':
        return 'Flinch';
      case 'FALL':
        return this.actions['Fall'] ? 'Fall' : 'Crouch';
      case 'INJURED_WALK':
      case 'INJUREDWALK':
        return this.actions['InjuredWalk'] ? 'InjuredWalk' : 'Run';
      case 'TALK':
      case 'IDLE':
      case 'RAISE_WEAPON':
      default:
        return 'Talk';
    }
  }

  /**
   * Switch animation with smooth crossfade transition (0.2s - 0.3s)
   * Scales clip timeScale accurately so footsteps never slide
   */
  public switchAnimation(animName: string, crossFadeDuration: number = 0.25, speed: number = 1.0) {
    if (!this.mixer) {
      this.pendingAnimation = { name: animName, blendTime: crossFadeDuration, speed };
      return;
    }

    const nextAction = this.actions[animName];
    if (!nextAction) {
      this.pendingAnimation = { name: animName, blendTime: crossFadeDuration, speed };
      return;
    }

    // Clamp speed to healthy non-zero range
    const validSpeed = Math.max(0.1, speed);

    if (this.currentAction === nextAction) {
      nextAction.setEffectiveTimeScale(validSpeed);
      return;
    }

    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setEffectiveTimeScale(validSpeed);
    nextAction.setEffectiveWeight(1);

    if (this.currentAction) {
      this.currentAction.crossFadeTo(nextAction, crossFadeDuration, true);
    }
    nextAction.play();

    this.currentAction = nextAction;
    this.activeAnimName = animName;
    this.pendingAnimation = null;
  }

  /**
   * Play any animation from the State Machine with smooth crossfade blending (0.2s - 0.3s)
   */
  public playAnimation(
    state: CharacterAnimState | string,
    blendTime: number = 0.25,
    speed: number = 1.0
  ) {
    this.targetState = state;
    this.currentState = state;
    this.blendDuration = blendTime;

    const clipName = this.mapStateToClipName(state);
    this.switchAnimation(clipName, blendTime, speed);
  }

  public setModelScale(scale: number) {
    this.modelGroup.scale.setScalar(scale);
  }

  public hasAnimation(name: string): boolean {
    return Boolean(this.actions[name]);
  }

  public setLeaningForward(isLeaning: boolean, angle: number = 0.22) {
    this.modelGroup.rotation.x = isLeaning ? angle : 0;
  }

  public setCombatLook(isCosmicHunter: boolean) {
    this.isCombatMode = isCosmicHunter;
  }

  /**
   * Update animation mixer
   */
  public updateAnimation(delta: number) {
    this.animTime += delta;
    if (this.mixer) {
      this.mixer.update(delta);
    }
  }

  /**
   * Called by CinematicController during cutscenes
   */
  public updateCinematicAction(
    delta: number,
    _cinematicTime: number,
    isRolling: boolean,
    _rollProgress: number
  ) {
    if (isRolling) {
      this.playAnimation('DIVE', 0.2, 1.0);
    }
    this.updateAnimation(delta);
  }

  /**
   * Standard gameplay update loop (walk/run/idle/dialogue/hurt/fall)
   * Synchronizes animation playback speed to actual movement speed
   * Smoothly blends in and out of movement (0.2s - 0.3s)
   */
  public update(
    delta: number,
    isMoving: boolean,
    isRolling: boolean = false,
    _rollProgress: number = 0,
    isDialogueActive: boolean = false,
    currentSpeed: number = 0,
    modelScale: number = 1.0,
    isCrouching: boolean = false
  ) {
    if (this.isLyingDown && !isMoving && !isRolling) {
      // Hold fallen / lying down state clamped at last frame
      this.updateAnimation(delta);
      return;
    }

    if (isMoving && this.isLyingDown) {
      // Moving cancels lying down
      this.isLyingDown = false;
    }

    if (isRolling) {
      this.playAnimation('DIVE', 0.2, 1.0);
      this.updateAnimation(delta);
      return;
    }

    if (isCrouching) {
      this.playAnimation('CROUCH', 0.2, 1.0);
      this.updateAnimation(delta);
      return;
    }

    if (isMoving) {
      // If Zane is hurt, play INJURED_WALK with 0.25s blend
      if (this.isHurt) {
        const moveSpeed = currentSpeed > 0 ? currentSpeed : (CharacterModel.AUTHORED_RUN_SPEED * 0.5 * modelScale);
        const injuredTimeScale = Math.max(0.5, moveSpeed / (modelScale * (CharacterModel.AUTHORED_RUN_SPEED * 0.5)));
        this.playAnimation('INJURED_WALK', 0.25, injuredTimeScale);
      } else {
        // Scale timeScale by (current speed / (modelScale * speed clip was authored for))
        const moveSpeed = currentSpeed > 0 ? currentSpeed : (CharacterModel.AUTHORED_RUN_SPEED * modelScale);
        const runTimeScale = Math.max(0.55, moveSpeed / (modelScale * CharacterModel.AUTHORED_RUN_SPEED));

        // Blend toward the idle/talk pose at very low speeds (e.g. less than 2.0)
        if (moveSpeed < 2.0 && this.mixer) {
          const runAction = this.actions['Run'];
          const idleAction = this.actions['Talk'];
          if (runAction && idleAction) {
            const runWeight = THREE.MathUtils.clamp((moveSpeed - 0.5) / 1.5, 0.0, 1.0);
            const idleWeight = 1.0 - runWeight;

            runAction.enabled = true;
            runAction.setEffectiveWeight(runWeight);
            runAction.setEffectiveTimeScale(runTimeScale);
            runAction.play();

            idleAction.enabled = true;
            idleAction.setEffectiveWeight(idleWeight);
            idleAction.setEffectiveTimeScale(1.0);
            idleAction.play();

            this.currentAction = runAction;
            this.activeAnimName = 'Run';
          } else {
            this.playAnimation('RUN', 0.25, runTimeScale);
          }
        } else {
          this.playAnimation('RUN', 0.25, runTimeScale);
        }
      }
    } else if (isDialogueActive) {
      this.playAnimation('TALK', 0.25, 1.0);
    } else {
      // Natural upright idle when standing still
      this.playAnimation('IDLE', 0.25, 1.0);
    }

    if (this.headTiltTimer > 0) {
      this.headTiltTimer = Math.max(0, this.headTiltTimer - delta);
      const t = this.headTiltTimer / 0.6;
      const tiltAngle = Math.sin((1 - t) * Math.PI) * 0.22; // ~12.5 degree head tilt
      this.modelGroup.rotation.z = tiltAngle;
    } else if (this.modelGroup.rotation.z !== 0) {
      this.modelGroup.rotation.z = 0;
    }

    this.updateAnimation(delta);
  }

  public getAnimInfo() {
    const clipName = this.currentAction?.getClip().name || this.currentState || 'IDLE';
    return {
      currentAnimName: clipName,
      mixerTime: this.mixer?.time ?? 0,
      isClipLoaded: Boolean(this.currentAction),
    };
  }
}

