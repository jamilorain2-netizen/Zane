import * as THREE from 'three';
import { soundEngine } from '../audio/soundEngine';
import { BattlefieldScene } from './BattlefieldScene';
import { CharacterModel } from './CharacterModel';
import { resolveCharacterCollisions } from '../utils/collision';
import { getShakeMultiplier } from '../utils/settings';

export type CinematicState =
  | 'intro_prologue'
  | 'drawings_imagination'
  | 'reality_transition'
  | 'gameplay';

export interface CinematicCallbackEvents {
  onSubtitleChange?: (speaker: string, text: string) => void;
  onControlsUnlocked?: () => void;
  onCinematicComplete?: (cutsceneId: string) => void;
  onFlashTransition?: (toReality: boolean) => void;
  onTelltaleNotification?: (text: string) => void;
  onExplosionPulse?: (intensity: number) => void;
}

export class CinematicController {
  public state: CinematicState = 'gameplay';
  public currentCutsceneId: string | null = null;
  public elapsedTime: number = 0;
  public cameraTrauma: number = 0;

  private events: CinematicCallbackEvents;

  // Camera lag smoothing vectors
  private currentCamPos = new THREE.Vector3(0, 2.5, 4.5);
  private currentLookAt = new THREE.Vector3(0, 1.2, 0);

  // Timed action flags for intro_prologue
  private hasExplosion1Triggered: boolean = false;
  private hasDive1Triggered: boolean = false;
  private hasRun2Triggered: boolean = false;
  private hasSlideTriggered: boolean = false;
  private hasRaiseWeaponTriggered: boolean = false;
  private hasMortarTriggered: boolean = false;
  private hasTransitionedReality: boolean = false;
  private hasDadShouted: boolean = false;
  private hasUnlockedControls: boolean = false;

  // Timed action flags for drawings_imagination
  private hasDrawingsSlideTriggered: boolean = false;
  private hasDrawingsLaserTriggered: boolean = false;
  private hasDrawingsConsoleTriggered: boolean = false;
  private hasDrawingsWipeTriggered: boolean = false;

  // Laser warning, firing and missile tracking flags
  private hasLaserWarningTriggered: boolean = false;
  private hasLaserFired: boolean = false;
  private hasMissileFired: boolean = false;
  private hasMissileImpacted: boolean = false;
  private missileMesh: THREE.Group | null = null;
  private missileSmokeTimer: number = 0;

  constructor(events: CinematicCallbackEvents) {
    this.events = events;
  }

  /**
   * Starts a cutscene ONLY if it has not already been completed.
   * Persistent check prevents any loop or duplicate playback.
   */
  public startCutscene(
    cutsceneId: 'intro_prologue' | 'drawings_imagination',
    completedCutscenes: Record<string, boolean> = {}
  ): boolean {
    if (completedCutscenes[cutsceneId]) {
      // Already complete: never re-run
      this.state = 'gameplay';
      this.currentCutsceneId = null;
      if (this.events.onControlsUnlocked) {
        this.events.onControlsUnlocked();
      }
      return false;
    }

    this.currentCutsceneId = cutsceneId;
    this.state = cutsceneId;
    this.elapsedTime = 0;
    this.cameraTrauma = 0;

    // Reset intro flags
    this.hasExplosion1Triggered = false;
    this.hasDive1Triggered = false;
    this.hasRun2Triggered = false;
    this.hasSlideTriggered = false;
    this.hasRaiseWeaponTriggered = false;
    this.hasMortarTriggered = false;
    this.hasTransitionedReality = false;
    this.hasDadShouted = false;
    this.hasUnlockedControls = false;

    // Reset drawings flags
    this.hasDrawingsSlideTriggered = false;
    this.hasDrawingsLaserTriggered = false;
    this.hasDrawingsConsoleTriggered = false;
    this.hasDrawingsWipeTriggered = false;

    // Reset laser/missile flags
    this.hasLaserWarningTriggered = false;
    this.hasLaserFired = false;
    this.hasMissileFired = false;
    this.hasMissileImpacted = false;
    this.missileMesh = null;
    this.missileSmokeTimer = 0;

    if (cutsceneId === 'intro_prologue') {
      this.currentCamPos.set(-2.8, 1.45, -6.3);
      this.currentLookAt.set(0, 1.15, -7.1);
    } else {
      this.currentCamPos.set(-2.5, 1.4, -2.0);
      this.currentLookAt.set(0, 1.1, 0);
    }

    return true;
  }

  /**
   * Immediately skips and cleans up any active cutscene, marking it complete.
   */
  public skipCurrentCutscene() {
    const finishedId = this.currentCutsceneId || 'intro_prologue';
    this.state = 'gameplay';
    this.cameraTrauma = 0;
    this.elapsedTime = 999;

    if (this.events.onSubtitleChange) {
      this.events.onSubtitleChange('', '');
    }

    if (this.events.onFlashTransition) {
      this.events.onFlashTransition(true);
    }

    if (this.events.onCinematicComplete) {
      this.events.onCinematicComplete(finishedId);
    }

    if (this.events.onControlsUnlocked) {
      this.events.onControlsUnlocked();
    }

    this.currentCutsceneId = null;
  }

  public addExplosionTrauma(amount: number = 0.8) {
    this.cameraTrauma = Math.min(1.0, this.cameraTrauma + amount);
    if (this.events.onExplosionPulse) {
      this.events.onExplosionPulse(amount);
    }
  }

  public update(
    delta: number,
    camera: THREE.PerspectiveCamera,
    zanePos: THREE.Vector3,
    battlefieldScene: BattlefieldScene | null,
    character: CharacterModel | null,
    updateZaneCinematic: (progress: number, isRolling: boolean, cinematicTime: number) => void
  ) {
    if (this.state === 'gameplay') return;

    this.elapsedTime += delta;

    // Decay trauma
    if (this.cameraTrauma > 0) {
      this.cameraTrauma = Math.max(0, this.cameraTrauma - delta * 2.5);
    }

    const traumaWeight = this.cameraTrauma * this.cameraTrauma;
    const baseShakeX = Math.sin(this.elapsedTime * 2.4) * 0.012;
    const baseShakeY = Math.cos(this.elapsedTime * 2.0) * 0.012;
    const explosionShakeX = (Math.sin(this.elapsedTime * 38.0) * 0.16 + (Math.random() - 0.5) * 0.08) * traumaWeight;
    const explosionShakeY = (Math.cos(this.elapsedTime * 44.0) * 0.16 + (Math.random() - 0.5) * 0.08) * traumaWeight;

    const shakeOffset = new THREE.Vector3(
      baseShakeX + explosionShakeX,
      baseShakeY + explosionShakeY,
      Math.sin(this.elapsedTime * 30.0) * 0.06 * traumaWeight
    ).multiplyScalar(getShakeMultiplier());

    let targetCamPos = new THREE.Vector3();
    let targetLookAt = new THREE.Vector3();

    if (character) {
      character.setModelScale(0.7);
    }

    // =========================================================================
    // CUTSCENE A: INTRO PROLOGUE (0 – 18.5s)
    // =========================================================================
    if (this.state === 'intro_prologue' || (this.state === 'reality_transition' && this.currentCutsceneId === 'intro_prologue')) {
      // A. MISSILE & LASER TRIGGER ANIMATIONS (PRE-PASS DETECTIONS)
      
      // 1. Laser warning cue at 2.5s - 3.0s
      if (this.elapsedTime >= 2.5 && this.elapsedTime < 3.0 && !this.hasLaserWarningTriggered && battlefieldScene) {
        this.hasLaserWarningTriggered = true;
        soundEngine.playLaser(1100); // Quick warning sound
        
        // Show glowing indicator at source
        const glowGeo = new THREE.SphereGeometry(0.35, 12, 12);
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.9 });
        const glowMesh = new THREE.Mesh(glowGeo, glowMat);
        glowMesh.position.set(-10, 1.5, 0.25);
        glowMesh.name = 'laser_warning_glow';
        battlefieldScene.group.add(glowMesh);
        setTimeout(() => {
          battlefieldScene.group.remove(glowMesh);
          glowGeo.dispose();
          glowMat.dispose();
        }, 500);
      }

      // 2. Single Laser fires at crouch moment (3.0s)
      if (this.elapsedTime >= 3.0 && !this.hasLaserFired && battlefieldScene) {
        this.hasLaserFired = true;
        battlefieldScene.spawnFromPool('laser_crouch', new THREE.Vector3(-10, 1.5, 0.25), new THREE.Vector3(10, 1.5, 0.25), 45, 0.45);
        soundEngine.playLaser(850);
      }

      // 3. Missile fired from background (3.8s) and impacts at 4.4s (exactly 0.4s after dive starts at 4.0s)
      if (this.elapsedTime >= 3.8 && !this.hasMissileFired && battlefieldScene) {
        this.hasMissileFired = true;
        soundEngine.playWhoosh();
        battlefieldScene.spawnFromPool('missile', new THREE.Vector3(15, 6, -15), new THREE.Vector3(2.5, 0, 0.8), 35.0, 0.6);
      }

      // B. POSITIONING, ANIMATIONS & DYNAMIC CAMERA ANGLES FOR EACH STAGE

      if (this.elapsedTime < 3.0) {
        const t = this.elapsedTime / 3.0;
        zanePos.set(0, 0, THREE.MathUtils.lerp(-12.0, 0.0, t));
        if (character) {
          character.group.position.copy(zanePos);
          character.group.rotation.y = 0;
          character.playAnimation('RUN', 0.2, 1.0);
        }

        // Side tracking shot while he runs
        targetCamPos.set(-3.2, 1.3, zanePos.z + 0.5);
        targetLookAt.set(zanePos.x, 1.0, zanePos.z + 0.3);

        if (this.elapsedTime < 0.2 && this.events.onSubtitleChange) {
          this.events.onSubtitleChange(
            'Narrator',
            'SECTOR 9 OUTER COLONY — 2088 // CORPORATE RADAR SWEEP IMMINENT'
          );
        }

        updateZaneCinematic(0, false, this.elapsedTime);
      } else if (this.elapsedTime < 4.0) {
        const t = (this.elapsedTime - 3.0) / 1.0;
        zanePos.set(0, 0, THREE.MathUtils.lerp(0.0, 0.5, t));
        if (character) {
          character.group.position.copy(zanePos);
          character.playAnimation('DUCK', 0.2);
        }

        if (!this.hasExplosion1Triggered) {
          this.hasExplosion1Triggered = true;
          if (this.events.onSubtitleChange) {
            this.events.onSubtitleChange(
              'Zane (Cosmic Hunter)',
              'Corporate radar sweep locked on! Shields at critical!'
            );
          }
          soundEngine.speakLine('Corporate radar sweep locked on! Shields at critical!', 'zane');
        }

        // Low angle at the crouch
        targetCamPos.set(1.4, 0.5, zanePos.z + 1.2);
        targetLookAt.set(zanePos.x, 0.5, zanePos.z);
        updateZaneCinematic(0, false, this.elapsedTime);
      } else if (this.elapsedTime < 6.0) {
        const rollT = (this.elapsedTime - 4.0) / 2.0;
        const posX = Math.sin(rollT * Math.PI) * 0.35;
        const posZ = THREE.MathUtils.lerp(0.5, 2.4, rollT);
        const arcY = Math.sin(rollT * Math.PI) * 0.35;

        zanePos.set(posX, 0, posZ);
        if (character) {
          character.group.position.set(posX, arcY, posZ);
          character.group.rotation.x = rollT * Math.PI * 2;
          character.playAnimation('DIVE', 0.2);
        }

        if (!this.hasDive1Triggered) {
          this.hasDive1Triggered = true;
          soundEngine.playRollWhoosh();
        }

        // Low close shot during the roll + camera React Whip from missile impact at 4.4s
        targetCamPos.set(zanePos.x + 0.9, 0.5, zanePos.z + 1.3);
        targetLookAt.set(zanePos.x, 0.4, zanePos.z);

        if (this.elapsedTime >= 4.4 && this.elapsedTime < 4.9) {
          const whipProgress = (this.elapsedTime - 4.4) / 0.5;
          const whipOffset = Math.sin(whipProgress * Math.PI * 2.0) * 0.55;
          targetLookAt.x += whipOffset;
          targetLookAt.z += whipOffset * 0.3;
        }

        updateZaneCinematic(rollT, true, this.elapsedTime);
      } else if (this.elapsedTime < 8.0) {
        const t = (this.elapsedTime - 6.0) / 2.0;
        zanePos.set(THREE.MathUtils.lerp(0.35, 0, t), 0, THREE.MathUtils.lerp(2.4, 10.4, t));

        if (character) {
          character.group.position.copy(zanePos);
          character.group.rotation.x = 0;
          character.group.rotation.y = 0;
          character.playAnimation('RUN', 0.2, 1.0);
        }

        if (!this.hasRun2Triggered) {
          this.hasRun2Triggered = true;
          if (this.events.onSubtitleChange) {
            this.events.onSubtitleChange(
              'Zane (Cosmic Hunter)',
              'Incoming turret fire! Moving to flanking position!'
            );
          }
          soundEngine.speakLine('Incoming turret fire! Moving to flanking position!', 'zane');
        }

        // Side tracking shot while he runs
        targetCamPos.set(-3.2, 1.3, zanePos.z + 0.5);
        targetLookAt.set(zanePos.x, 1.0, zanePos.z + 0.3);
        updateZaneCinematic(0, false, this.elapsedTime);
      } else if (this.elapsedTime < 10.0) {
        const t = (this.elapsedTime - 8.0) / 2.0;
        zanePos.set(0, 0, THREE.MathUtils.lerp(4.0, 5.5, t));

        if (character) {
          character.group.position.copy(zanePos);
          character.group.rotation.x = 0;
          character.playAnimation('SLIDE', 0.2);
        }

        if (!this.hasSlideTriggered) {
          this.hasSlideTriggered = true;
          if (this.events.onSubtitleChange) {
            this.events.onSubtitleChange(
              'Zane (Cosmic Hunter)',
              'Locked and loaded! Evading heavy mortar barrage!'
            );
          }
          soundEngine.speakLine('Locked and loaded! Evading heavy mortar barrage!', 'zane');
        }

        targetCamPos.set(zanePos.x - 1.6, 0.55, zanePos.z + 1.2);
        targetLookAt.set(zanePos.x, 0.5, zanePos.z);
        updateZaneCinematic(0, false, this.elapsedTime);
      } else if (this.elapsedTime < 12.5) {
        zanePos.set(0, 0, 5.7);
        if (character) {
          character.group.position.copy(zanePos);
          character.group.rotation.x = 0;
          character.group.rotation.y = 0;
          character.playAnimation('RAISE_WEAPON', 0.25);
        }

        if (!this.hasRaiseWeaponTriggered) {
          this.hasRaiseWeaponTriggered = true;
        }

        targetCamPos.set(zanePos.x + 0.18, 1.28, zanePos.z + 0.95);
        targetLookAt.set(zanePos.x, 1.22, zanePos.z);
        updateZaneCinematic(0, false, this.elapsedTime);
      } else if (this.elapsedTime < 14.5) {
        const rollT = (this.elapsedTime - 12.5) / 2.0;

        if (!this.hasMortarTriggered) {
          this.hasMortarTriggered = true;
          if (this.events.onSubtitleChange) {
            this.events.onSubtitleChange('Zane (Cosmic Hunter)', 'Heavy mortar strike incoming! Dive, dive, dive!');
          }
          soundEngine.speakLine('Heavy mortar strike incoming! Dive, dive, dive!', 'zane');

          // Trigger explosion far away in background (12 units out) to prevent clipping
          if (battlefieldScene) {
            battlefieldScene.triggerImpactExplosion(new THREE.Vector3(12.0, 0.05, 4.8), true);
          }
          this.addExplosionTrauma(1.0);
          soundEngine.playRollWhoosh();
          soundEngine.playImpact();
        }

        const posZ = THREE.MathUtils.lerp(5.7, 7.2, rollT);
        const arcY = Math.sin(rollT * Math.PI) * 0.35;
        zanePos.set(0, 0, posZ);

        if (character) {
          character.group.position.set(0, arcY, posZ);
          character.group.rotation.x = rollT * Math.PI * 2;
          character.playAnimation('DIVE', 0.2);
        }

        targetCamPos.set(0.8, 0.95, zanePos.z + 1.8);
        targetLookAt.set(0, 0.65, zanePos.z);
        updateZaneCinematic(rollT, true, this.elapsedTime);
      } else if (this.elapsedTime < 16.5) {
        if (!this.hasTransitionedReality) {
          this.hasTransitionedReality = true;
          this.state = 'reality_transition';
          soundEngine.playWhoosh();
          if (this.events.onFlashTransition) {
            this.events.onFlashTransition(true);
          }
          soundEngine.playImpact();
        }

        const rollFinishT = (this.elapsedTime - 14.5) / 2.0;
        targetCamPos.set(-1.2, 0.8, 2.8);
        targetLookAt.set(0, 0.6, 0);
        updateZaneCinematic(Math.min(1.0, rollFinishT), true, this.elapsedTime);
      } else if (this.elapsedTime <= 18.5) {
        targetCamPos.set(0, 2.2, 4.0);
        targetLookAt.set(0, 1.0, 0);

        if (!this.hasDadShouted) {
          this.hasDadShouted = true;
          soundEngine.playRadioStatic();
          if (this.events.onSubtitleChange) {
            this.events.onSubtitleChange('Dad (Downstairs)', '“Zane! Get down here before the corporate radar sweep!”');
          }
          soundEngine.speakLine('Zane! Get down here before the corporate radar sweep!', 'dad');
          if (this.events.onTelltaleNotification) {
            this.events.onTelltaleNotification('Dad will remember your response time.');
          }

          if (character) {
            character.group.position.set(0, 0, 1.6);
            character.group.rotation.set(0, Math.PI, 0);
            character.playAnimation('IDLE', 0.35);
          }
        }

        updateZaneCinematic(1.0, false, this.elapsedTime);
      } else {
        // Cutscene finished cleanly
        if (!this.hasUnlockedControls) {
          this.hasUnlockedControls = true;
          this.state = 'gameplay';
          const finishedId = this.currentCutsceneId || 'intro_prologue';
          this.currentCutsceneId = null;

          if (this.events.onCinematicComplete) {
            this.events.onCinematicComplete(finishedId);
          }
          if (this.events.onControlsUnlocked) {
            this.events.onControlsUnlocked();
          }
        }
      }
    }

    // =========================================================================
    // CUTSCENE B: STORY DRAWINGS IMAGINATION (0 – 7.5s)
    // =========================================================================
    else if (this.state === 'drawings_imagination') {
      if (this.elapsedTime < 2.5) {
        const t = this.elapsedTime / 2.5;
        zanePos.set(0, 0, THREE.MathUtils.lerp(0.0, 5.0, t));
        if (character) {
          character.group.position.copy(zanePos);
          character.group.rotation.y = 0;
          character.playAnimation('RUN', 0.2, 1.0);
        }

        if (!this.hasDrawingsLaserTriggered && this.elapsedTime > 0.5) {
          this.hasDrawingsLaserTriggered = true;
          if (this.events.onSubtitleChange) {
            this.events.onSubtitleChange('Zane (Cosmic Hunter)', '✦ Space Cruiser Armada engaging! Evading asteroid field! ✦');
          }
          soundEngine.speakLine('Space Cruiser Armada engaging! Evading asteroid field!', 'zane');
          soundEngine.playLaser(880);
        }

        targetCamPos.set(zanePos.x - 2.5, 1.35, zanePos.z + 1.2);
        targetLookAt.set(zanePos.x, 1.1, zanePos.z + 0.4);
        updateZaneCinematic(0, false, this.elapsedTime);
      } else if (this.elapsedTime < 5.0) {
        const t = (this.elapsedTime - 2.5) / 2.5;
        zanePos.set(0, 0, THREE.MathUtils.lerp(5.0, 7.5, t));
        if (character) {
          character.group.position.copy(zanePos);
          character.playAnimation('SLIDE', 0.2);
        }

        if (!this.hasDrawingsSlideTriggered) {
          this.hasDrawingsSlideTriggered = true;
          soundEngine.playRollWhoosh();
          if (battlefieldScene) {
            battlefieldScene.spawnTargetedLaser(new THREE.Vector3(-4, 3, 6), new THREE.Vector3(2, 0.1, 7), 30);
          }
        }

        targetCamPos.set(zanePos.x + 1.8, 0.6, zanePos.z + 1.2);
        targetLookAt.set(zanePos.x, 0.5, zanePos.z);
        updateZaneCinematic(0, false, this.elapsedTime);
      } else if (this.elapsedTime < 6.8) {
        zanePos.set(0, 0, 7.5);
        if (character) {
          character.group.position.copy(zanePos);
          character.playAnimation('RAISE_WEAPON', 0.2);
        }

        if (!this.hasDrawingsConsoleTriggered) {
          this.hasDrawingsConsoleTriggered = true;
          if (this.events.onSubtitleChange) {
            this.events.onSubtitleChange('Zane (Cosmic Hunter)', '“Sector 9 perimeter mapped! Cosmic coordinates logged!”');
          }
          soundEngine.speakLine('Sector 9 perimeter mapped! Cosmic coordinates logged!', 'zane');
          soundEngine.playLaser(740);
        }

        targetCamPos.set(zanePos.x + 0.2, 1.3, zanePos.z + 1.1);
        targetLookAt.set(zanePos.x, 1.2, zanePos.z);
        updateZaneCinematic(0, false, this.elapsedTime);
      } else if (this.elapsedTime < 7.5) {
        if (!this.hasDrawingsWipeTriggered) {
          this.hasDrawingsWipeTriggered = true;
          soundEngine.playWhoosh();
          if (this.events.onFlashTransition) {
            this.events.onFlashTransition(true);
          }
          if (this.events.onSubtitleChange) {
            this.events.onSubtitleChange('Zane', '“Back in my room. That was an epic flight plan!”');
          }
        }

        targetCamPos.set(0, 2.0, 3.2);
        targetLookAt.set(0, 1.2, 0);
        updateZaneCinematic(1.0, false, this.elapsedTime);
      } else {
        // Drawings imagination sequence complete!
        this.state = 'gameplay';
        const finishedId = this.currentCutsceneId || 'drawings_imagination';
        this.currentCutsceneId = null;

        if (this.events.onCinematicComplete) {
          this.events.onCinematicComplete(finishedId);
        }
        if (this.events.onControlsUnlocked) {
          this.events.onControlsUnlocked();
        }
      }
    }

    // Post-pass: calculate real ground height and height offsets (jump/roll arc)
    let groundY = 0;
    let heightOffset = 0;

    const isImaginationMode = (this.state === 'intro_prologue' && this.elapsedTime < 14.5)
      || (this.state === 'drawings_imagination' && this.elapsedTime < 6.8);

    if (isImaginationMode && battlefieldScene) {
      groundY = battlefieldScene.getGroundY(zanePos.x, zanePos.z);
      
      // Extract the scripted heightOffset (jump/roll arc) that was set during the cutscene
      if (this.state === 'intro_prologue') {
        if (this.elapsedTime >= 4.0 && this.elapsedTime < 6.0) {
          const rollT = (this.elapsedTime - 4.0) / 2.0;
          heightOffset = Math.sin(rollT * Math.PI) * 0.35;
        } else if (this.elapsedTime >= 12.5 && this.elapsedTime < 14.5) {
          const rollT = (this.elapsedTime - 12.5) / 2.0;
          heightOffset = Math.sin(rollT * Math.PI) * 0.35;
        }
      }
    }

    // Set zanePos.y to ground Y, and the character group's Y to ground Y + heightOffset
    zanePos.y = groundY;
    if (character) {
      character.group.position.y = groundY + heightOffset;
    }

    // 1. Clamp camera y above ground (at least 0.9 above ground y=0, and at least getGroundY + 1.0 in imagination)
    let minCameraY = 0.9;
    if (isImaginationMode && battlefieldScene) {
      const cameraGroundY = battlefieldScene.getGroundY(targetCamPos.x, targetCamPos.z);
      minCameraY = Math.max(0.9, cameraGroundY + 1.0);
    }
    targetCamPos.y = Math.max(minCameraY, targetCamPos.y);

    // Keep looking at the character's chest (groundY + 1.0)
    if (isImaginationMode) {
      targetLookAt.y = groundY + 1.0;
    }

    // 2. Keep camera at least 1.2 units away from the character
    const charHeadPos = zanePos.clone().add(new THREE.Vector3(0, 1.1, 0));
    const distToChar = targetCamPos.distanceTo(charHeadPos);
    if (distToChar < 1.2) {
      const dir = targetCamPos.clone().sub(charHeadPos).normalize();
      targetCamPos.copy(charHeadPos).addScaledVector(dir, 1.2);
    }

    // 3. Keep camera above rocks and crates (bounding boxes from battlefieldScene.colliders)
    if (battlefieldScene && battlefieldScene.colliders) {
      battlefieldScene.colliders.forEach((col) => {
        const cx = (col.minX + col.maxX) / 2;
        const cz = (col.minZ + col.maxZ) / 2;
        const rx = (col.maxX - col.minX) / 2 + 0.5;
        const rz = (col.maxZ - col.minZ) / 2 + 0.5;
        if (Math.abs(targetCamPos.x - cx) < rx && Math.abs(targetCamPos.z - cz) < rz) {
          targetCamPos.y = Math.max(targetCamPos.y, (col.height || 1.2) + 0.35);
        }
      });
    }

    // Camera smoothing
    const lagSpeed = 5.2;
    this.currentCamPos.lerp(targetCamPos, Math.min(1.0, delta * lagSpeed));
    this.currentLookAt.lerp(targetLookAt, Math.min(1.0, delta * lagSpeed));

    // Clamp smoothed currentCamPos and currentLookAt as well to avoid dipping below terrain
    if (isImaginationMode && battlefieldScene) {
      const currentCameraGroundY = battlefieldScene.getGroundY(this.currentCamPos.x, this.currentCamPos.z);
      this.currentCamPos.y = Math.max(currentCameraGroundY + 1.0, this.currentCamPos.y);
      this.currentLookAt.y = groundY + 1.0;
    }

    camera.position.copy(this.currentCamPos).add(shakeOffset);
    camera.lookAt(this.currentLookAt.clone().add(shakeOffset));
  }
}
