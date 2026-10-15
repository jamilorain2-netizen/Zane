import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { CharacterModel } from './CharacterModel';
import { DadCharacter } from './DadCharacter';
import { BedroomScene } from './BedroomScene';
import { HouseMapScene } from './HouseMapScene';
import { WorkshopScene } from './WorkshopScene';
import { RestroomScene } from './RestroomScene';
import { BasementScene } from './BasementScene';
import { BattlefieldScene } from './BattlefieldScene';
import { InteractiveDoor } from './InteractiveDoor';
import { CinematicController } from './CinematicController';
import { soundEngine } from '../audio/soundEngine';
import { InteractionNode, SceneLocation, StoryState, QuestId, QuestStatus } from '../types/game';
import { createToonMaterial } from '../utils/toonShader';
import { GraphicNovelPaperOverlay } from './GraphicNovelPaperOverlay';
import {
  CrayonFloatingLabels,
  getActionWordFromNode,
} from './CrayonFloatingLabels';
import { HallwayJigsawPuzzle } from './HallwayJigsawPuzzle';
import { QuietHandsMinigame } from './QuietHandsMinigame';
import { PowerRestoreMinigame } from './PowerRestoreMinigame';
import { EndCard } from './EndCard';
import { CyberPostprocessingPipeline } from '../utils/cyberPostprocessing';
import { DeveloperMenu } from './DeveloperMenu';
import {
  resolveCharacterCollisions,
  createColliderDebugGroup,
  CHARACTER_COLLIDER_RADIUS,
  BoxCollider2D,
} from '../utils/collision';
import { loadSettings, saveSettings, getShakeMultiplier, isReduceShakeEnabled, GameSettings } from '../utils/settings';
import { getClipStatuses } from '../utils/assetLoader';

export type BeerRequestPhase =
  | 'idle'
  | 'tv_murmur'
  | 'dad_request'
  | 'near_silence'
  | 'dad_shout'
  | 'dad_now';

interface ThreeCanvasProps {
  currentLocation: SceneLocation;
  onLocationChange: (loc: SceneLocation) => void;
  onActiveNodeChange: (node: InteractionNode | null) => void;
  onSubtitleChange: (speaker: string, text: string) => void;
  onTelltaleNotification: (text: string) => void;
  onControlsUnlocked: () => void;
  activeInspectModal: string | null;
  onCloseInspect: () => void;
  isCinematicPlaying: boolean;
  onSkipCinematic: () => void;
  isDialogueActive?: boolean;
  isChoiceActive?: boolean;
  completedCutscenes: Record<string, boolean>;
  onCutsceneComplete: (id: string) => void;
  isPaused?: boolean;
  storyState?: StoryState;
  onStoryStateChange?: (state: StoryState) => void;
  onTriggerBeerRequest?: (callback?: (choice: string) => void) => void;
  onReturnToMenu?: () => void;
}

// Module-level singleton renderer cache to prevent duplicate WebGL contexts in React Strict Mode / re-mounts
let cachedRenderer: THREE.WebGLRenderer | null = null;

function disposeMaterial(mat: THREE.Material) {
  for (const key of Object.keys(mat)) {
    const val = (mat as any)[key];
    if (val && typeof val === 'object' && 'isTexture' in val) {
      (val as THREE.Texture).dispose();
    }
  }
  mat.dispose();
}

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).geometry) {
      (child as THREE.Mesh).geometry.dispose();
    }
    if ((child as THREE.Mesh).material) {
      const mat = (child as THREE.Mesh).material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => disposeMaterial(m));
      } else {
        disposeMaterial(mat);
      }
    }
  });
}

function getFloorY(x: number, z: number): number {
  if (x >= 1.8 && x <= 6.0 && z >= 10.2 && z <= 11.8) {
    const t = Math.max(0, Math.min(1, (x - 1.8) / (6.0 - 1.8)));
    return THREE.MathUtils.lerp(0, -3.2, t);
  }
  if (x > 6.0 && x <= 17.0 && z >= 6.0 && z <= 16.0) {
    return -3.2;
  }
  return 0;
}

// Dynamic Continuous World Camera Clamping (spans adjacent rooms near open doorways)
function clampCameraToContinuousWorld(
  desiredPos: THREE.Vector3,
  currentRoom: string,
  playerPos: THREE.Vector3,
  bedroomDoor: InteractiveDoor | null,
  workshopDoor: InteractiveDoor | null,
  basementDoor: InteractiveDoor | null,
  restroomDoor: InteractiveDoor | null
): THREE.Vector3 {
  const clamped = desiredPos.clone();
  
  const floorAtCam = getFloorY(clamped.x, clamped.z);
  const minCamY = floorAtCam + 0.9;
  const maxCamY = floorAtCam + 3.2;
  clamped.y = THREE.MathUtils.clamp(clamped.y, minCamY, maxCamY);

  let minX = -3.7, maxX = 3.7, minZ = -3.7, maxZ = 3.7;

  if (currentRoom === 'basement' || (clamped.x >= 1.8 && clamped.z >= 6.0 && clamped.z <= 16.0)) {
    minX = 1.8; maxX = 17.0; minZ = 6.0; maxZ = 16.0;
  } else if (currentRoom === 'bedroom') {
    minX = -3.7; maxX = 3.7; minZ = -3.7; maxZ = 3.7;
    if (bedroomDoor?.isOpen && playerPos.z > 2.0) {
      maxZ = 12.0;
    }
  } else if (currentRoom === 'hallway') {
    minX = -1.3; maxX = 1.3; minZ = 4.8; maxZ = 19.0;
    if (bedroomDoor?.isOpen && playerPos.z < 6.5) {
      minZ = -3.7;
      minX = -3.7; maxX = 3.7;
    }
    if (workshopDoor?.isOpen && playerPos.z >= 4.5 && playerPos.z <= 11.0) {
      minX = -7.4;
    }
    if (basementDoor?.isOpen && playerPos.z >= 9.0 && playerPos.z <= 13.0) {
      maxX = 17.0;
    }
    if (restroomDoor?.isOpen && playerPos.z > 17.0) {
      maxZ = 23.8;
      minX = -1.6; maxX = 1.6;
    }
    if (playerPos.z >= 13.5 && playerPos.z <= 19.5) {
      if (playerPos.x > 0.5) maxX = 7.5;
      if (playerPos.x < -0.5) minX = -7.5;
    }
  } else if (currentRoom === 'workshop') {
    minX = -7.4; maxX = -2.0; minZ = 5.0; maxZ = 10.2;
    if (workshopDoor?.isOpen && playerPos.x > -3.2) {
      maxX = 1.3;
    }
  } else if (currentRoom === 'restroom') {
    minX = -1.6; maxX = 1.6; minZ = 19.8; maxZ = 23.8;
    if (restroomDoor?.isOpen && playerPos.z < 21.0) {
      minZ = 16.0;
    }
  } else if (currentRoom === 'basement') {
    minX = 1.8; maxX = 17.0; minZ = 6.0; maxZ = 16.0;
  } else if (currentRoom === 'living_room') {
    minX = 2.0; maxX = 7.5; minZ = 13.8; maxZ = 19.0;
    if (playerPos.x < 3.2) {
      minX = -1.3;
    }
  } else if (currentRoom === 'kitchen') {
    minX = -7.5; maxX = -2.0; minZ = 13.8; maxZ = 19.0;
    if (playerPos.x > -3.2) {
      maxX = 1.3;
    }
  }

  clamped.x = THREE.MathUtils.clamp(clamped.x, minX, maxX);
  clamped.z = THREE.MathUtils.clamp(clamped.z, minZ, maxZ);
  return clamped;
}

export const ThreeCanvas: React.FC<ThreeCanvasProps> = ({
  currentLocation,
  onLocationChange,
  onActiveNodeChange,
  onSubtitleChange,
  onTelltaleNotification,
  onControlsUnlocked,
  activeInspectModal,
  onCloseInspect,
  isCinematicPlaying,
  onSkipCinematic,
  isDialogueActive = false,
  isChoiceActive = false,
  completedCutscenes,
  onCutsceneComplete,
  isPaused = false,
  storyState,
  onStoryStateChange,
  onTriggerBeerRequest,
  onReturnToMenu,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const isPausedRef = useRef(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;
    if (isPaused && document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  }, [isPaused]);

  // Mouse look modes & pointer lock state
  const [lookMode, setLookMode] = useState<'locked' | 'drag'>('locked');
  const lookModeRef = useRef<'locked' | 'drag'>('locked');
  const [isPointerLocked, setIsPointerLocked] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);

  useEffect(() => {
    lookModeRef.current = lookMode;
  }, [lookMode]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  // Crayon Floating World Labels DOM References for 60fps lag-free direct transform updates
  const labelItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const labelNameRefs = useRef<Record<string, HTMLElement | null>>({});
  const labelBurstRefs = useRef<Record<string, HTMLElement | null>>({});
  const labelActionRefs = useRef<Record<string, HTMLElement | null>>({});
  const labelActionWordRefs = useRef<Record<string, HTMLElement | null>>({});
  const labelMarkerRefs = useRef<Record<string, HTMLElement | null>>({});

  const registerItemRef = useCallback((id: string, el: HTMLDivElement | null) => {
    labelItemRefs.current[id] = el;
  }, []);
  const registerNameRef = useCallback((id: string, el: HTMLElement | null) => {
    labelNameRefs.current[id] = el;
  }, []);
  const registerBurstRef = useCallback((id: string, el: HTMLElement | null) => {
    labelBurstRefs.current[id] = el;
  }, []);
  const registerActionRef = useCallback((id: string, el: HTMLElement | null) => {
    labelActionRefs.current[id] = el;
  }, []);
  const registerActionWordRef = useCallback((id: string, el: HTMLElement | null) => {
    labelActionWordRefs.current[id] = el;
  }, []);
  const registerMarkerRef = useCallback((id: string, el: HTMLElement | null) => {
    labelMarkerRefs.current[id] = el;
  }, []);

  // Synchronized refs for props to ensure stable animation loops and prevent remounting
  const onLocationChangeRef = useRef(onLocationChange);
  const onActiveNodeChangeRef = useRef(onActiveNodeChange);
  const onSubtitleChangeRef = useRef(onSubtitleChange);
  const onTelltaleNotificationRef = useRef(onTelltaleNotification);
  const onControlsUnlockedRef = useRef(onControlsUnlocked);
  const onCutsceneCompleteRef = useRef(onCutsceneComplete);
  const completedCutscenesRef = useRef(completedCutscenes);
  const isDialogueActiveRef = useRef(isDialogueActive);
  const isChoiceActiveRef = useRef(isChoiceActive);
  const isCinematicPlayingRef = useRef(isCinematicPlaying);
  const onStoryStateChangeRef = useRef(onStoryStateChange);

  const storyStateRef = useRef<StoryState>(
    storyState || {
      completedCutscenes: {},
      quests: {
        get_wrench: 'active',
        hallway_pictures: 'active',
        kitchen_key: 'inactive',
        basement_wrench: 'inactive',
        deliver_wrench: 'inactive',
        kitchen_beer: 'inactive',
      },
      triggeredZones: {},
      openingPlayed: false,
      hasKey: false,
      hasWrench: false,
      hasFlashlight: false,
    }
  );

  const isWrenchHandoffRef = useRef<boolean>(false);
  const wrenchHandoffTimerRef = useRef<number>(0);
  const wrenchHandoffStartPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const wrenchHandoffTargetPosRef = useRef<THREE.Vector3>(new THREE.Vector3());

  const dadWalkProgressRef = useRef<number | null>(null);
  const beerTimerRef = useRef<any>(null);
  const onTriggerBeerRequestRef = useRef(onTriggerBeerRequest);
  const onReturnToMenuRef = useRef(onReturnToMenu);
  useEffect(() => {
    onTriggerBeerRequestRef.current = onTriggerBeerRequest;
    onReturnToMenuRef.current = onReturnToMenu;
  }, [onTriggerBeerRequest, onReturnToMenu]);

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
    onActiveNodeChangeRef.current = onActiveNodeChange;
    onSubtitleChangeRef.current = onSubtitleChange;
    onTelltaleNotificationRef.current = onTelltaleNotification;
    onControlsUnlockedRef.current = onControlsUnlocked;
    onCutsceneCompleteRef.current = onCutsceneComplete;
    completedCutscenesRef.current = completedCutscenes;
    isDialogueActiveRef.current = isDialogueActive;
    isChoiceActiveRef.current = isChoiceActive;
    isCinematicPlayingRef.current = isCinematicPlaying;
    onStoryStateChangeRef.current = onStoryStateChange;
    if (storyState) {
      storyStateRef.current = storyState;
    }
  });

  // Scene & Engine References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const characterRef = useRef<CharacterModel | null>(null);
  const dadCharacterRef = useRef<DadCharacter | null>(null);
  const limpTimer = useRef<number>(0);
  const [dadAnimState, setDadAnimState] = useState<string>('WORK');
  const [sofaSeatOffset, setSofaSeatOffset] = useState<{ x: number; y: number; z: number; rotY: number }>({ x: -0.58, y: 0, z: 0, rotY: 0 });
  const sofaSeatOffsetRef = useRef<{ x: number; y: number; z: number; rotY: number }>({ x: -0.58, y: 0, z: 0, rotY: 0 });
  const [isZaneHurt, setIsZaneHurt] = useState<boolean>(false);
  const isZaneHurtRef = useRef<boolean>(false);
  const bedroomSceneRef = useRef<BedroomScene | null>(null);
  const houseSceneRef = useRef<HouseMapScene | null>(null);
  const workshopSceneRef = useRef<WorkshopScene | null>(null);
  const restroomSceneRef = useRef<RestroomScene | null>(null);
  const basementSceneRef = useRef<BasementScene | null>(null);
  const battlefieldSceneRef = useRef<BattlefieldScene | null>(null);
  const cinematicRef = useRef<CinematicController | null>(null);

  const bedroomDoorRef = useRef<InteractiveDoor | null>(null);
  const workshopDoorRef = useRef<InteractiveDoor | null>(null);
  const basementDoorRef = useRef<InteractiveDoor | null>(null);
  const restroomDoorRef = useRef<InteractiveDoor | null>(null);

  const triggerZonesRef = useRef<{
    id: string;
    name: string;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    minY: number;
    maxY: number;
    helper: THREE.LineSegments;
    onEnter: () => void;
  }[]>([]);

  // Global Base Lighting References
  const globalAmbientLightRef = useRef<THREE.AmbientLight | null>(null);
  const globalHemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const globalDirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const currentRoomRef = useRef<string>('bedroom');
  const setWorldModeRef = useRef<((mode: 'imagination' | 'real', callerName?: string, options?: { spawn?: THREE.Vector3 }) => void) | null>(null);

  // Supply Depot Dedicated Lighting References & Fullbright Toggle
  const depotAmbientLightRef = useRef<THREE.AmbientLight | null>(null);
  const depotHemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const depotDirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const depotCounterLightRef = useRef<THREE.DirectionalLight | null>(null);
  const isFullbrightRef = useRef<boolean>(false);
  const [isFullbright, setIsFullbright] = useState<boolean>(false);

  // Debug Colliders and Touching Collider
  const [showColliders, setShowColliders] = useState<boolean>(false);
  const showCollidersRef = useRef<boolean>(false);
  const debugCollidersGroupRef = useRef<THREE.Group | null>(null);
  const debugCollidersFrameCount = useRef<number>(0);
  const touchingColliderRef = useRef<string | null>(null);

  // Player position and movement
  const playerPos = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 1.8));
  const playerRotation = useRef<number>(Math.PI);
  const currentLookTarget = useRef<THREE.Vector3>(new THREE.Vector3(0, 1.2, 1.8));

  // Third-person Mouse Look (Yaw and Pitch in radians)
  const cameraYaw = useRef<number>(Math.PI);
  const cameraPitch = useRef<number>(0);
  const wasPointerLockedRef = useRef<boolean>(false);

  // Input states
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const forwardVecRef = useRef(new THREE.Vector3());
  const rightVecRef = useRef(new THREE.Vector3());
  const isRightInvertedRef = useRef(false);
  const heldKeysRef = useRef<string[]>([]);
  const footstepTimer = useRef<number>(0);

  // Inspect mode camera transition
  const inspectMode = useRef<'none' | 'drawings' | 'window' | 'holo_tv'>('none');
  const lastActiveNodeIdRef = useRef<string | null>(null);

  // Slow push-in tracking during dialogue
  const dialogueDolly = useRef<number>(0);

  // Smooth cinematic cuts & intentional imagination screen wipes
  const [cutActive, setCutActive] = useState<boolean>(false);
  const [flashActive, setFlashActive] = useState<boolean>(false);
  const [screenWipeActive, setScreenWipeActive] = useState<boolean>(false);
  const [wipeMode, setWipeMode] = useState<'to_imagination' | 'to_reality'>('to_reality');

  // World Mode: 'real' vs 'imagination' (Supply Depot)
  const worldModeRef = useRef<'real' | 'imagination'>('real');
  const [, setWorldModeState] = useState<'real' | 'imagination'>('real');
  const [redVignettePulse, setRedVignettePulse] = useState<boolean>(false);

  // Supply Depot Stealth & Checkpoints
  const activeCheckpointRef = useRef<THREE.Vector3>(new THREE.Vector3(500, 0, -12));
  const jumpVelocityYRef = useRef<number>(0);
  const isGroundedRef = useRef<boolean>(true);
  const isRespawningRef = useRef<boolean>(false);
  const isTransitioningRef = useRef<boolean>(false);

  // Beer Fall Cutscene State & Overlays
  type BeerCutscenePhase =
    | 'none'
    | 'phase1_chair_fall'
    | 'phase2_first_person'
    | 'phase2_shout'
    | 'phase3_blink_close'
    | 'phase3_blink_hold'
    | 'phase3_blink_open'
    | 'phase4_chase'
    | 'phase5_impact'
    | 'phase5_voice'
    | 'phase5_hold_black'
    | 'hard_cut_black'
    | 'chair_fall'
    | 'first_person_floor'
    | 'dad_shout'
    | 'eyelid_closing'
    | 'eyelid_hold_black'
    | 'eyelid_opening'
    | 'battlefield_first_person'
    | 'camera_pullback';

  const [beerCutscenePhase, setBeerCutscenePhase] = useState<BeerCutscenePhase>('none');
  const beerCutscenePhaseRef = useRef<BeerCutscenePhase>('none');
  const [isBeerCutsceneActive, setIsBeerCutsceneActive] = useState<boolean>(false);
  const isBeerCutsceneActiveRef = useRef<boolean>(false);
  const beerCutsceneTimerRef = useRef<number>(0);
  const beerCutsceneSubTimerRef = useRef<number>(0);

  const [eyelidProgress, setEyelidProgress] = useState<number>(0); // 0 = open, 1 = closed
  const [softBlurVignette, setSoftBlurVignette] = useState<boolean>(false);
  const [largeShakingSubtitle, setLargeShakingSubtitle] = useState<string | null>(null);

  const glassShardsMeshRef = useRef<THREE.Group | null>(null);

  // Power restore light flicker & lerp refs
  const isPowerFlickeringRef = useRef<boolean>(false);
  const powerFlickerTimerRef = useRef<number>(0);
  const basementPowerLerpRef = useRef<number>(0);

  // Chase & Ending Sequence States & Refs
  const chaseTimerRef = useRef<number>(0);
  const hasStumbledRef = useRef<boolean>(false);
  const stumbleTimerRef = useRef<number>(0);
  const isChaseFrozenRef = useRef<boolean>(false);
  const catchTimerRef = useRef<number>(0);
  const isHardCutBlackRef = useRef<boolean>(false);
  const [isHardCutBlack, setIsHardCutBlack] = useState<boolean>(false);
  const blackHoldTimerRef = useRef<number>(0);
  const [showEndCard, setShowEndCard] = useState<boolean>(false);

  // Dad Beer Request Cutscene ("beerRequest" Event & Heavy Dread Atmosphere)
  const [isBeerRequestActive, setIsBeerRequestActive] = useState<boolean>(false);
  const isBeerRequestActiveRef = useRef<boolean>(false);
  const beerRequestPhaseRef = useRef<BeerRequestPhase>('idle');
  const beerRequestTimerRef = useRef<number>(0);
  const beerRequestPushInRef = useRef<number>(0);
  const cameraShakeIntensityRef = useRef<number>(0);
  const lastVibeTimeRef = useRef<number>(0);

  const [cssVibration, setCssVibration] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [heavyAtmosphereVignette, setHeavyAtmosphereVignette] = useState<number>(0);
  const [heavyAtmosphereDesat, setHeavyAtmosphereDesat] = useState<number>(0);
  const [chromaPulse, setChromaPulse] = useState<number>(0);
  const heartbeatTimerRef = useRef<number>(0);
  const [chaseVignetteOpacity, setChaseVignetteOpacity] = useState<number>(0);
  const fpsCapRef = useRef<number>(loadSettings().fpsCap || 60);
  const lastRenderTimeRef = useRef<number>(0);

  const triggerRedVignettePulse = useCallback(() => {
    setRedVignettePulse(true);
    setTimeout(() => {
      setRedVignettePulse(false);
    }, 400);
  }, []);

  const lastTriggerFiredRef = useRef<string>('None');
  const savedRealPlayerPosRef = useRef<THREE.Vector3>(new THREE.Vector3(-6.65, 0.42, 14.5));

  const setPlayerPos = useCallback((pos: THREE.Vector3 | [number, number, number], callerName: string) => {
    if (Array.isArray(pos)) {
      playerPos.current.set(pos[0], pos[1], pos[2]);
    } else {
      playerPos.current.copy(pos);
    }
    lastTriggerFiredRef.current = callerName;
    if (worldModeRef.current === 'imagination') {
      console.log('[Imagination Position Change Caller]', callerName, playerPos.current.clone());
    }
  }, []);

  const setWorldMode = useCallback((
    mode: 'real' | 'imagination',
    callerName: string = 'unknown',
    options?: { spawn?: THREE.Vector3 }
  ) => {
    worldModeRef.current = mode;
    setWorldModeState(mode);
    lastTriggerFiredRef.current = `setWorldMode(${mode}) by ${callerName} @ ${new Date().toLocaleTimeString()}`;

    const isImagination = mode === 'imagination';

    // 1. Scene Groups
    if (battlefieldSceneRef.current) {
      battlefieldSceneRef.current.group.visible = isImagination;
    }
    if (bedroomSceneRef.current) bedroomSceneRef.current.group.visible = !isImagination;
    if (houseSceneRef.current) houseSceneRef.current.group.visible = !isImagination;
    if (workshopSceneRef.current) workshopSceneRef.current.group.visible = !isImagination;
    if (restroomSceneRef.current) restroomSceneRef.current.group.visible = !isImagination;
    if (basementSceneRef.current) basementSceneRef.current.group.visible = !isImagination;

    // 2. Door Groups (Pivot & Frame)
    const doors = [
      bedroomDoorRef.current,
      workshopDoorRef.current,
      basementDoorRef.current,
      restroomDoorRef.current,
    ];
    doors.forEach((door) => {
      if (door) {
        door.pivotGroup.visible = !isImagination;
        door.frameGroup.visible = !isImagination;
      }
    });

    // 3. Real World Global Lights
    if (globalAmbientLightRef.current) {
      globalAmbientLightRef.current.visible = !isImagination;
    }
    if (globalHemiLightRef.current) {
      globalHemiLightRef.current.visible = !isImagination;
    }
    if (globalDirLightRef.current) {
      globalDirLightRef.current.visible = !isImagination;
    }

    // 4. Dad Real Model
    if (dadCharacterRef.current) {
      dadCharacterRef.current.group.visible = !isImagination;
    }

    // 5. Character Scale & Combat Look
    if (characterRef.current) {
      characterRef.current.setModelScale(isImagination ? 0.7 : 1.0);
      characterRef.current.setCombatLook(isImagination);
    }

    // 6. Real-World Floating Labels
    if (isImagination) {
      Object.values(labelItemRefs.current).forEach((el) => {
        if (el && el.style.display !== 'none') el.style.display = 'none';
      });
    }

    // Reset all overlay opacities when entering the depot
    if (isImagination) {
      setEyelidProgress(0);
      setSoftBlurVignette(false);
      setHeavyAtmosphereVignette(0);
      setHeavyAtmosphereDesat(0);
      setChromaPulse(0);
      setChaseVignetteOpacity(0);
      setRedVignettePulse(false);
      setIsHardCutBlack(false);
      setScreenWipeActive(false);
      beerRequestPushInRef.current = 0;
      cameraShakeIntensityRef.current = 0;
    }

    // 7. Scene Background and Fog (0x0b1830 and FogExp2 0x0b1830 density 0.012 in depot)
    if (sceneRef.current) {
      if (isImagination) {
        sceneRef.current.background = new THREE.Color(0x0b1830);
        sceneRef.current.fog = isFullbrightRef.current ? null : new THREE.FogExp2(0x0b1830, 0.012);
      } else {
        sceneRef.current.background = new THREE.Color(0xded0bb);
        sceneRef.current.fog = isFullbrightRef.current ? null : new THREE.FogExp2(0xded0bb, 0.015);
      }
    }
    if (rendererRef.current) {
      rendererRef.current.toneMappingExposure = isImagination ? 1.3 : 0.8;
      if (isImagination) rendererRef.current.setClearColor(0x0b1830, 1.0);
    }

    // 8. Restore room visibility or set spawn & camera snap
    if (isImagination) {
      const spawn = options?.spawn ? options.spawn.clone() : new THREE.Vector3(500, 0, -12);
      playerPos.current.copy(spawn);
      if (characterRef.current) characterRef.current.group.position.copy(spawn);
      activeCheckpointRef.current.copy(spawn);
      jumpVelocityYRef.current = 0;
      isGroundedRef.current = true;
      keysPressed.current = {};
      isTransitioningRef.current = false;
      isRespawningRef.current = false;

      // Snap camera behind Zane
      cameraYaw.current = 0;
      cameraPitch.current = 0.15;
      playerRotation.current = 0;
      if (cameraRef.current) {
        cameraRef.current.position.set(
          spawn.x - Math.sin(0) * 4.0 * Math.cos(0.15),
          spawn.y + 1.8 + 3.0 * Math.sin(0.15),
          spawn.z - Math.cos(0) * 4.0 * Math.cos(0.15)
        );
        currentLookTarget.current.set(spawn.x, spawn.y + 1.2, spawn.z);
        cameraRef.current.lookAt(currentLookTarget.current);
      }
    } else {
      keysPressed.current = {};
      isTransitioningRef.current = false;
      jumpVelocityYRef.current = 0;
      isGroundedRef.current = true;

      const room = currentRoomRef.current;
      if (bedroomSceneRef.current) bedroomSceneRef.current.group.visible = (room === 'bedroom');
      if (houseSceneRef.current) houseSceneRef.current.group.visible = (room === 'hallway' || room === 'living_room' || room === 'kitchen');
      if (workshopSceneRef.current) workshopSceneRef.current.group.visible = (room === 'workshop');
      if (restroomSceneRef.current) restroomSceneRef.current.group.visible = (room === 'restroom');
      if (basementSceneRef.current) basementSceneRef.current.group.visible = (room === 'basement');
    }
  }, []);

  // Keep setWorldModeRef synced
  setWorldModeRef.current = setWorldMode;

  // Skip handler for the Ending Cutscene (Only active when ?dev=1 is present)
  const handleSkipBeerCutscene = useCallback(() => {
    isBeerCutsceneActiveRef.current = false;
    setIsBeerCutsceneActive(false);
    beerCutscenePhaseRef.current = 'none';
    setBeerCutscenePhase('none');
    setEyelidProgress(0);
    setSoftBlurVignette(false);
    setLargeShakingSubtitle(null);
    setChaseVignetteOpacity(0);
    setHeavyAtmosphereVignette(0);
    setHeavyAtmosphereDesat(0);
    cameraShakeIntensityRef.current = 0;

    soundEngine.stopAllAudio();
    soundEngine.stopSlowBreathing();
    soundEngine.stopHeavyBreathing();
    soundEngine.stopMuffledAudio();

    onSubtitleChangeRef.current?.('', '');

    setShowEndCard(true);
    setIsHardCutBlack(false);
    isHardCutBlackRef.current = false;
  }, []);

  // Reset Heavy Atmosphere visuals and Web Audio safely so Esc never leaves them stuck
  const resetBeerSceneAtmosphere = useCallback(() => {
    soundEngine.stopHeavyAtmosphere();
    soundEngine.stopTvMurmur();
    cameraShakeIntensityRef.current = 0;
    beerRequestPushInRef.current = 0;
    setCssVibration({ x: 0, y: 0 });
    setHeavyAtmosphereVignette(0);
    setHeavyAtmosphereDesat(0);
    setChromaPulse(0);

    if (globalAmbientLightRef.current && worldModeRef.current !== 'imagination') {
      globalAmbientLightRef.current.intensity = 0.85;
    }
    if (globalHemiLightRef.current) {
      globalHemiLightRef.current.intensity = 0.50;
    }
    if (globalDirLightRef.current) {
      globalDirLightRef.current.intensity = 1.8;
    }
  }, []);

  // When player selects a choice in the beer request dialogue
  const handleBeerChoicePicked = useCallback((choiceText: string) => {
    try {
      localStorage.setItem('beerReply', choiceText);
    } catch {}
    storyStateRef.current.beerReply = choiceText;
    onStoryStateChangeRef.current?.(storyStateRef.current);

    // Transition to 1.2s near silence
    beerRequestPhaseRef.current = 'near_silence';
    beerRequestTimerRef.current = 0;
    onSubtitleChangeRef.current?.('', '');
    soundEngine.stopTvMurmur();
  }, []);

  // Start the Dad Beer Request Cutscene (Event: beerRequest)
  const startBeerRequestScene = useCallback(() => {
    if (isBeerRequestActiveRef.current) return;

    // Ensure Dad is seated on sofa
    if (dadCharacterRef.current) {
      dadCharacterRef.current.group.position.copy(DadCharacter.LIVING_ROOM_SOFA_POS);
      dadCharacterRef.current.group.rotation.y = DadCharacter.LIVING_ROOM_SOFA_ROT_Y;
      dadCharacterRef.current.sitIdle();
    }

    isBeerRequestActiveRef.current = true;
    setIsBeerRequestActive(true);
    beerRequestPhaseRef.current = 'tv_murmur';
    beerRequestTimerRef.current = 0;
    beerRequestPushInRef.current = 0;

    // Freeze movement and release pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }

    // 2 seconds of TV murmur
    soundEngine.startTvMurmur();
  }, []);

  // Register window event listener and global helper for beerRequest
  useEffect(() => {
    (window as any).triggerBeerRequest = startBeerRequestScene;
    (window as any).onBeerReplyChosen = handleBeerChoicePicked;

    const handleBeerRequestEvent = () => {
      startBeerRequestScene();
    };
    window.addEventListener('beerRequest', handleBeerRequestEvent);

    return () => {
      window.removeEventListener('beerRequest', handleBeerRequestEvent);
      delete (window as any).triggerBeerRequest;
      delete (window as any).onBeerReplyChosen;
      resetBeerSceneAtmosphere();
    };
  }, [startBeerRequestScene, handleBeerChoicePicked, resetBeerSceneAtmosphere]);

  // Frame update handler for the Ending Cutscene (One scripted cutscene with NO player control)
  const updateBeerCutscene = useCallback(
    (delta: number) => {
      beerCutsceneTimerRef.current += delta;
      beerCutsceneSubTimerRef.current += delta;
      const subTimer = beerCutsceneSubTimerRef.current;
      const phase = beerCutscenePhaseRef.current;

      const char = characterRef.current;
      const dad = dadCharacterRef.current;
      const house = houseSceneRef.current;
      const camera = cameraRef.current;
      const battlefield = battlefieldSceneRef.current;

      if (!camera) return;

      // Ensure animation mixers of ALL characters keep updating every frame while cutscene runs
      if (char) char.update(delta, false, false, 0);
      if (dad) dad.update(delta);
      if (battlefield) {
        battlefield.updateMonsterAnimation(delta);
        if (battlefield.group.visible) {
          battlefield.update(delta, playerPos.current, false, false);
        }
      }

      // Ensure pointer lock is released during cutscene
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }

      // =========================================================================
      // PHASE 1: Real world, third person (Kitchen chair reaching & bottle shatter)
      // =========================================================================
      if (
        phase === 'phase1_chair_fall' ||
        phase === 'chair_fall' ||
        phase === 'hard_cut_black'
      ) {
        // Hard cut to the real kitchen
        if (worldModeRef.current !== 'real') {
          setWorldMode('real', 'ending_cutscene');
        }

        const chairMesh = houseSceneRef.current?.questChairMesh;

        // Zane stands on the chair reaching toward high shelf
        if (subTimer < 0.6) {
          playerPos.current.set(-6.65, 0.42, 14.5);
          if (char) {
            char.group.position.set(-6.65, 0.42, 14.5);
            char.group.rotation.set(0, -Math.PI / 2, subTimer * 0.35); // Reaching & tipping
          }
          if (chairMesh) {
            chairMesh.rotation.z = subTimer * 0.35;
          }

          // Third-person camera viewing Zane on chair, slowly pushing in
          const pushInProg = Math.min(1.0, subTimer / 2.1);
          const camPos = new THREE.Vector3().lerpVectors(
            new THREE.Vector3(-5.0, 1.45, 16.2),
            new THREE.Vector3(-5.6, 1.20, 15.4),
            pushInProg
          );
          camera.position.copy(camPos);
          camera.lookAt(-6.65, 1.1 - pushInProg * 0.3, 14.5);
        } else if (subTimer >= 0.6 && subTimer < 0.65) {
          // Chair tips, Zane plays FALL
          if (char) {
            char.fall();
            char.group.position.set(-6.8, 0, 14.8);
            char.group.rotation.set(0, 0, 0);
          }
          playerPos.current.set(-6.8, 0, 14.8);
          if (chairMesh) {
            chairMesh.rotation.z = 0.85; // Toppled chair
          }

          // Bottle falls and shatters (sharp break sound & glass particles)
          soundEngine.playGlassBreak();

          if (house && !glassShardsMeshRef.current) {
            const shards = new THREE.Group();
            shards.position.set(-7.2, 0.01, 14.7);
            for (let i = 0; i < 16; i++) {
              const shardMat = createToonMaterial({ color: 0x5c2c06, desaturate: 0.05 });
              const shard = new THREE.Mesh(
                new THREE.ConeGeometry(0.035 + Math.random() * 0.045, 0.02, 3),
                shardMat
              );
              shard.position.set((Math.random() - 0.5) * 0.5, 0.005, (Math.random() - 0.5) * 0.5);
              shard.rotation.y = Math.random() * Math.PI * 2;
              shards.add(shard);
            }
            house.group.add(shards);
            glassShardsMeshRef.current = shards;
          }
        } else {
          // 1.5 seconds of silence: keep 3rd-person camera slowly pushing in
          const pushInProg = Math.min(1.0, subTimer / 2.1);
          const camPos = new THREE.Vector3().lerpVectors(
            new THREE.Vector3(-5.0, 1.45, 16.2),
            new THREE.Vector3(-5.7, 0.95, 15.3),
            pushInProg
          );
          camera.position.copy(camPos);
          camera.lookAt(-6.8, 0.25, 14.8);
        }

        // After 1.5 seconds of silence (0.6s + 1.5s = 2.1s)
        if (subTimer >= 2.1) {
          beerCutscenePhaseRef.current = 'phase2_first_person';
          setBeerCutscenePhase('phase2_first_person');
          beerCutsceneSubTimerRef.current = 0;

          // Switch to first-person floor view with soft vignette, muffled audio, slow breathing
          setSoftBlurVignette(true);
          soundEngine.startMuffledAudio();
          soundEngine.playSlowBreathing();

          if (dad) {
            dad.group.position.set(-2.8, 0, 16.5);
            dad.group.rotation.set(0, 0, 0);
            dad.playState('WALK', 0.2);
          }
        }
      }

      // =========================================================================
      // PHASE 2: First person lying on floor & Dad approaches
      // =========================================================================
      else if (phase === 'phase2_first_person' || phase === 'first_person_floor') {
        // Camera at Zane's eye level lying on the floor (0.35 units high, looking at doorway, slightly tilted)
        camera.position.set(-6.8, 0.35, 14.8);
        camera.lookAt(-2.8, 0.75, 16.2);
        camera.rotation.z += 0.15; // Dutch tilt

        // Dad enters doorway and walks toward camera, facing camera
        const walkProg = Math.min(1.0, subTimer / 2.6);
        const dadX = THREE.MathUtils.lerp(-2.8, -5.2, walkProg);
        const dadZ = THREE.MathUtils.lerp(16.5, 15.2, walkProg);

        if (dad) {
          dad.group.position.set(dadX, 0, dadZ);
          dad.group.lookAt(-6.8, 0, 14.8);
        }

        // Camera bump on each heavy step
        const bump = Math.abs(Math.sin(subTimer * 7.5)) * 0.035;
        camera.position.y = 0.35 + bump;

        const distToDad = dad ? dad.group.position.distanceTo(new THREE.Vector3(-6.8, 0, 14.8)) : 3.0;

        // At about 2.5 units away: he shouts "MY BEER!"
        if (distToDad <= 2.5 || subTimer >= 2.5) {
          beerCutscenePhaseRef.current = 'phase2_shout';
          setBeerCutscenePhase('phase2_shout');
          beerCutsceneSubTimerRef.current = 0;

          if (dad) dad.playState('YELL', 0.15);
          soundEngine.speakLine('MY BEER!', 'dad');
          setLargeShakingSubtitle('MY BEER!');

          // Heavy atmosphere effect (no flashes faster than 3 per second)
          setHeavyAtmosphereVignette(0.92);
          setHeavyAtmosphereDesat(0.65);
        }
      }

      else if (phase === 'phase2_shout' || phase === 'dad_shout') {
        // Decaying camera shake
        const decay = Math.max(0, 1.0 - subTimer / 1.8);
        const shakeMag = 0.065 * (decay * decay) * getShakeMultiplier();
        const shakeX = (Math.random() - 0.5) * shakeMag;
        const shakeY = (Math.random() - 0.5) * shakeMag;
        camera.position.set(-6.8 + shakeX, 0.35 + shakeY, 14.8);
        camera.lookAt(-2.8, 0.75, 16.2);
        camera.rotation.z += 0.15;

        // Slow atmosphere pulse (1.5 Hz, strictly <= 3 flashes per second)
        const pulse = Math.sin(subTimer * Math.PI * 3.0) * 0.08;
        setHeavyAtmosphereVignette(Math.min(1.0, 0.88 + Math.max(0, pulse)));

        if (subTimer >= 1.9) {
          setLargeShakingSubtitle(null);
          beerCutscenePhaseRef.current = 'phase3_blink_close';
          setBeerCutscenePhase('phase3_blink_close');
          beerCutsceneSubTimerRef.current = 0;
        }
      }

      // =========================================================================
      // PHASE 3: Blink (two feathered eyelids close 1.4s, hold 0.6s, open 1.2s)
      // =========================================================================
      else if (phase === 'phase3_blink_close' || phase === 'eyelid_closing') {
        const prog = Math.min(1.0, subTimer / 1.4);
        setEyelidProgress(prog);

        camera.position.set(-6.8, 0.35, 14.8);
        camera.lookAt(-2.8, 0.75, 16.2);
        camera.rotation.z += 0.15;

        if (subTimer >= 1.4) {
          beerCutscenePhaseRef.current = 'phase3_blink_hold';
          setBeerCutscenePhase('phase3_blink_hold');
          beerCutsceneSubTimerRef.current = 0;
        }
      }

      else if (phase === 'phase3_blink_hold' || phase === 'eyelid_hold_black') {
        setEyelidProgress(1.0);

        // During the black: switch to imagination battlefield & clear audio/overlays
        if (subTimer >= 0.1 && subTimer < 0.25) {
          setWorldMode('imagination', 'cutscene_blink', { spawn: new THREE.Vector3(0, 0, -12) });
          soundEngine.stopMuffledAudio();
          soundEngine.stopSlowBreathing();
          setSoftBlurVignette(false);
          setHeavyAtmosphereVignette(0);
          setHeavyAtmosphereDesat(0);

          // Reset real Dad to sofa
          // Reset real Dad to sofa and KEEP DAD HIDDEN
          if (dad) {
            dad.group.position.copy(DadCharacter.LIVING_ROOM_SOFA_POS);
            dad.group.rotation.y = DadCharacter.LIVING_ROOM_SOFA_ROT_Y;
            dad.playState('SIT_IDLE');
            dad.group.visible = false;
          }

          // Zane starts on clear path of battlefield
          if (char) {
            char.standUp();
            char.setHurt(true);
            char.group.position.set(0, 0, -12);
            char.group.rotation.set(0, 0, 0); // Facing down the +Z corridor
            char.playAnimation('INJURED_WALK', 0.2, 1.45);
          }
          playerPos.current.set(0, 0, -12);

          // Monster starts ~7 units behind Zane (at z = -19) facing down corridor
          if (battlefieldSceneRef.current) {
            battlefieldSceneRef.current.setChaseMode(true);
            battlefieldSceneRef.current.moveMonsterToWorld(
              new THREE.Vector3(0, 0, -19.0),
              new THREE.Vector3(0, 0, -12.0)
            );
          }
        }

        if (subTimer >= 0.6) {
          beerCutscenePhaseRef.current = 'phase3_blink_open';
          setBeerCutscenePhase('phase3_blink_open');
          beerCutsceneSubTimerRef.current = 0;
        }
      }

      else if (phase === 'phase3_blink_open' || phase === 'eyelid_opening') {
        const prog = Math.max(0.0, 1.0 - subTimer / 1.2);
        setEyelidProgress(prog);

        // Third-person camera behind Zane on battlefield
        camera.position.set(0, 1.6, -15.8);
        camera.lookAt(0, 1.2, -11.0);

        if (subTimer >= 1.2) {
          setEyelidProgress(0);
          beerCutscenePhaseRef.current = 'phase4_chase';
          setBeerCutscenePhase('phase4_chase');
          beerCutsceneSubTimerRef.current = 0;
          heartbeatTimerRef.current = 0;

          if (char) {
            char.setLeaningForward(true, 0.22);
            char.playAnimation('INJURED_WALK', 0.2, 1.6);
          }
          if (dad) {
            dad.group.visible = false;
          }
          if (battlefield) {
            battlefield.setChaseMode(true);
            battlefield.playMonsterAnimation('run', 1.0);
          }
        }
      }

      // =========================================================================
      // PHASE 4: Imagination, no control (Injured run along 20-unit clear path)
      // =========================================================================
      else if (phase === 'phase4_chase') {
        const chaseDuration = 7.5;
        const chaseProg = Math.min(1.0, subTimer / chaseDuration);

        // Zane runs along clear path of about 20 units (from z = -12 to z = 8)
        const zaneZ = -12.0 + chaseProg * 20.0;
        playerPos.current.set(0, 0, zaneZ);
        if (char) {
          char.group.position.set(0, 0, zaneZ);
          char.group.rotation.set(0, 0, 0);
          char.setLeaningForward(true, 0.22);
          char.playAnimation('INJURED_WALK', 0.2, 1.6);
        }

        // Limping camera sway behind Zane
        const sway = Math.sin(subTimer * 6.0) * 0.12;
        const limpBob = Math.abs(Math.cos(subTimer * 3.0)) * 0.08;
        // Camera tightening as monster closes in (distance tightens from 3.8 to 2.3)
        const camDist = THREE.MathUtils.lerp(3.8, 2.3, chaseProg);
        camera.position.set(sway, 1.55 + limpBob, zaneZ - camDist);
        camera.lookAt(0, 1.2, zaneZ + 1.2);

        // Audio: heavy breathing & heartbeat that speeds up
        soundEngine.playHeavyBreathing();
        heartbeatTimerRef.current += delta;
        const hbInterval = THREE.MathUtils.lerp(0.85, 0.22, chaseProg);
        if (heartbeatTimerRef.current >= hbInterval) {
          heartbeatTimerRef.current = 0;
          soundEngine.playHeartbeatThump();
        }

        // Keep Dad hidden during phases 3 and 4
        if (dad) {
          dad.group.visible = false;
        }

        // Show the monster running behind Zane along his path (starting about 7 units behind him and closing to 0.7 units by the catch)
        const monsterDistBehind = THREE.MathUtils.lerp(7.0, 0.7, chaseProg);
        const monsterZ = zaneZ - monsterDistBehind;
        if (battlefield) {
          battlefield.moveMonsterToWorld(
            new THREE.Vector3(0, 0, monsterZ),
            new THREE.Vector3(0, 0, zaneZ)
          );
        }

        // Red vignette growing
        setChaseVignetteOpacity(0.15 + chaseProg * 0.80);

        // The catch: monster reaches Zane
        if (chaseProg >= 1.0 || subTimer >= chaseDuration) {
          if (battlefield) {
            battlefield.playMonsterAnimation('roar', 1.0);
            setTimeout(() => {
              battlefieldSceneRef.current?.playMonsterAnimation('attack', 1.0);
            }, 200);
          }
          beerCutscenePhaseRef.current = 'phase5_impact';
          setBeerCutscenePhase('phase5_impact');
          beerCutsceneSubTimerRef.current = 0;

          // Single heavy "splat" impact sound (no depiction on screen)
          soundEngine.playSplatImpact();
          // Cut to black immediately on impact
          isHardCutBlackRef.current = true;
          setIsHardCutBlack(true);
          // Stop all audio & overlays
          soundEngine.stopAllAudio();
          setChaseVignetteOpacity(0);
          setLargeShakingSubtitle(null);
        }
      }

      // =========================================================================
      // PHASE 5: The Catch & Black Screen Voice & End Card
      // =========================================================================
      else if (phase === 'phase5_impact') {
        // 1.5 seconds of silence over black
        if (subTimer >= 1.5) {
          beerCutscenePhaseRef.current = 'phase5_voice';
          setBeerCutscenePhase('phase5_voice');
          beerCutsceneSubTimerRef.current = 0;

          // The monster's deep, distorted voice says: "You will soon join your mom."
          soundEngine.speakMonsterLine('You will soon join your mom.');
          onSubtitleChangeRef.current?.('Monster Dad', '“You will soon join your mom.”');
        }
      }

      else if (phase === 'phase5_voice') {
        if (subTimer >= 2.4) {
          onSubtitleChangeRef.current?.('', '');
          beerCutscenePhaseRef.current = 'phase5_hold_black';
          setBeerCutscenePhase('phase5_hold_black');
          beerCutsceneSubTimerRef.current = 0;
        }
      }

      else if (phase === 'phase5_hold_black') {
        // 3 seconds of black
        if (subTimer >= 3.0) {
          beerCutscenePhaseRef.current = 'none';
          setBeerCutscenePhase('none');
          isBeerCutsceneActiveRef.current = false;
          setIsBeerCutsceneActive(false);
          setShowEndCard(true);
          setIsHardCutBlack(false);
        }
      }
    },
    [setWorldMode]
  );

  const handleEndCardBackToMenu = useCallback(() => {
    setShowEndCard(false);
    setIsHardCutBlack(false);
    isHardCutBlackRef.current = false;
    isChaseFrozenRef.current = false;
    chaseTimerRef.current = 0;
    hasStumbledRef.current = false;
    stumbleTimerRef.current = 0;
    catchTimerRef.current = 0;
    blackHoldTimerRef.current = 0;
    isZaneHurtRef.current = false;
    setIsZaneHurt(false);
    setChaseVignetteOpacity(0);
    setHeavyAtmosphereVignette(0);
    setHeavyAtmosphereDesat(0);
    setSoftBlurVignette(false);
    setLargeShakingSubtitle(null);
    setEyelidProgress(0);
    cameraShakeIntensityRef.current = 0;

    if (characterRef.current) {
      characterRef.current.setLeaningForward(false);
      characterRef.current.standUp();
      characterRef.current.setHurt(false);
      characterRef.current.playAnimation('TALK', 0.1, 1.0);
    }

    if (dadCharacterRef.current) {
      dadCharacterRef.current.group.visible = true;
      dadCharacterRef.current.group.position.copy(DadCharacter.LIVING_ROOM_SOFA_POS);
      dadCharacterRef.current.group.rotation.y = DadCharacter.LIVING_ROOM_SOFA_ROT_Y;
      dadCharacterRef.current.playState('SIT_IDLE');
    }

    if (battlefieldSceneRef.current) {
      battlefieldSceneRef.current.setChaseMode(false);
      battlefieldSceneRef.current.group.visible = false;
      if (battlefieldSceneRef.current.monsterDadGroup) {
        battlefieldSceneRef.current.monsterDadGroup.visible = false;
      }
    }

    setWorldMode('real', 'menu_reset');
    soundEngine.stopAllAudio();

    // Reset story state completely
    storyStateRef.current = {
      completedCutscenes: {},
      quests: {
        get_wrench: 'active',
        hallway_pictures: 'active',
        kitchen_key: 'inactive',
        basement_wrench: 'inactive',
        deliver_wrench: 'inactive',
        kitchen_beer: 'inactive',
      },
      triggeredZones: {},
      openingPlayed: false,
      hasKey: false,
      hasWrench: false,
      hasFlashlight: false,
    };
    onStoryStateChangeRef.current?.(storyStateRef.current);

    if (onReturnToMenuRef.current) {
      onReturnToMenuRef.current();
    }
  }, [setWorldMode]);
  const [screenShakeActive, setScreenShakeActive] = useState<boolean>(false);
  const [explosionPulseActive, setExplosionPulseActive] = useState<boolean>(false);

  // Hallway Pictures Quest State & Space Station Neon Light Colors
  const isHallwayImaginationRef = useRef<boolean>(false);
  const [, setIsHallwayImagination] = useState<boolean>(false);
  const alignedPanelsCountRef = useRef<number>(0);
  const hallwayNeonTransitionRef = useRef<number>(0);
  const [activePuzzlePanelId, setActivePuzzlePanelId] = useState<string | null>(null);
  const isPuzzleOpenRef = useRef<boolean>(false);

  // Quiet Hands Minigame & Kitchen Imagination Layer
  const [isQuietHandsOpen, setIsQuietHandsOpen] = useState<boolean>(false);
  const isQuietHandsOpenRef = useRef<boolean>(false);
  const [isPowerRestoreOpen, setIsPowerRestoreOpen] = useState<boolean>(false);
  const isPowerRestoreOpenRef = useRef<boolean>(false);
  const isKitchenImaginationRef = useRef<boolean>(false);
  const [, setIsKitchenImagination] = useState<boolean>(false);



  // Cyber Post-Processing Pipeline & Camera Transition FX Refs
  const cyberPostPipelineRef = useRef<CyberPostprocessingPipeline | null>(null);
  const fovBoostRef = useRef<number>(0);
  const glitchTimerRef = useRef<number>(0);
  const dutchTiltRef = useRef<number>(0);
  const fpsSamplesRef = useRef<{ frames: number; time: number; lowFps: boolean }>({
    frames: 0,
    time: 0,
    lowFps: false,
  });

  const realAmbientColor = useMemo(() => new THREE.Color(0xffedd5), []);
  const realHemiSkyColor = useMemo(() => new THREE.Color(0xfff1db), []);
  const realHemiGroundColor = useMemo(() => new THREE.Color(0xd4a373), []);
  const realDirColor = useMemo(() => new THREE.Color(0xffe8ba), []);

  const neonAmbientColor = useMemo(() => new THREE.Color(0x0284c7), []);
  const neonHemiSkyColor = useMemo(() => new THREE.Color(0x38bdf8), []);
  const neonHemiGroundColor = useMemo(() => new THREE.Color(0x1e1b4b), []);
  const neonDirColor = useMemo(() => new THREE.Color(0x06b6d4), []);

  // Function to execute an intentional screen wipe with whoosh sound & cyber transition effects
  const triggerImaginationWipe = useCallback((toImagination: boolean, midAction?: () => void) => {
    soundEngine.playWhoosh();
    setWipeMode(toImagination ? 'to_imagination' : 'to_reality');
    setScreenWipeActive(true);

    // Glitch effect on enter and exit (~0.35s duration)
    glitchTimerRef.current = 0.35;

    if (toImagination) {
      // FOV widen on entry (+6 degrees, easing back over 1 second)
      fovBoostRef.current = 6.0;
      soundEngine.playBassHit();
    }

    setTimeout(() => {
      if (midAction) midAction();
    }, 180);

    setTimeout(() => {
      setScreenWipeActive(false);
    }, 450);
  }, []);

  // Function to execute a clean cinematic cut between angles
  const triggerCinematicCut = useCallback(() => {
    setCutActive(true);
    setTimeout(() => {
      setCutActive(false);
    }, 180);
  }, []);

  // Handler when a jigsaw puzzle is completed
  const handlePuzzleComplete = useCallback(
    (panelId: string) => {
      isPuzzleOpenRef.current = false;
      setActivePuzzlePanelId(null);

      const didAlign = houseSceneRef.current?.alignPanel(panelId);
      if (didAlign) {
        soundEngine.playSoftClick();
        characterRef.current?.tiltHead(0.6);
        alignedPanelsCountRef.current += 1;
        const count = alignedPanelsCountRef.current;

        if (count === 1) {
          onSubtitleChangeRef.current?.('Zane', '“One aligned.”');
          soundEngine.speakLine('One aligned.', 'zane');
        } else if (count >= 2) {
          onSubtitleChangeRef.current?.('Zane', '“Seal complete. Everything’s in place.”');
          soundEngine.speakLine("Seal complete. Everything's in place.", 'zane');

          // Align rotation takes 0.6s with ease-out; wait 0.8s then wipe to reality
          setTimeout(() => {
            triggerImaginationWipe(false, () => {
              isHallwayImaginationRef.current = false;
              setIsHallwayImagination(false);
              houseSceneRef.current?.setImaginationMode(false);
            });

            setTimeout(() => {
              onSubtitleChangeRef.current?.('Zane', '“Better.”');
              soundEngine.speakLine('Better.', 'zane');

              storyStateRef.current.quests.hallway_pictures = 'completed';
              storyStateRef.current.quests.kitchen_key = 'active';
              onStoryStateChangeRef.current?.(storyStateRef.current);
              onTelltaleNotificationRef.current?.('Hallway Panels Aligned');
              soundEngine.playTelltaleBell();

              setTimeout(() => {
                soundEngine.playRadioStatic();
                onSubtitleChangeRef.current?.('Dad', '“Zane! What’s taking so long?”');
                soundEngine.speakLine("Zane! What's taking so long?", 'dad');
              }, 1800);
            }, 400);
          }, 800);
        }
      }
    },
    [triggerImaginationWipe]
  );

  // Sync isQuietHandsOpenRef and release pointer lock when open
  useEffect(() => {
    isQuietHandsOpenRef.current = isQuietHandsOpen;
    if (isQuietHandsOpen) {
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
    }
  }, [isQuietHandsOpen]);

  useEffect(() => {
    isPowerRestoreOpenRef.current = isPowerRestoreOpen;
    if (isPowerRestoreOpen) {
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
    }
  }, [isPowerRestoreOpen]);

  const handlePowerRestoreWin = useCallback(() => {
    isPowerRestoreOpenRef.current = false;
    setIsPowerRestoreOpen(false);

    storyStateRef.current.hasPower = true;
    storyStateRef.current.quests.basement_wrench = 'active';
    basementSceneRef.current?.revealWrench();

    isPowerFlickeringRef.current = true;
    powerFlickerTimerRef.current = 0;

    onStoryStateChangeRef.current?.(storyStateRef.current);
    onTelltaleNotificationRef.current?.('Power Restored - Wrench Unlocked');
  }, []);

  // Handler when Quiet Hands minigame is won
  const handleQuietHandsWin = useCallback(() => {
    isQuietHandsOpenRef.current = false;
    setIsQuietHandsOpen(false);

    storyStateRef.current.hasKey = true;
    storyStateRef.current.quests.kitchen_key = 'completed';
    storyStateRef.current.quests.basement_wrench = 'active';

    if (basementDoorRef.current) {
      basementDoorRef.current.setLocked(false);
      basementDoorRef.current.interactionNode.promptVerb = 'Open';
      basementDoorRef.current.interactionNode.name = 'Basement Door';
      basementDoorRef.current.interactionNode.description = 'Press E to open Basement Door.';
    }

    onStoryStateChangeRef.current?.(storyStateRef.current);
    soundEngine.playItemPickup();

    // Trigger kitchen imagination layer & wipe!
    triggerImaginationWipe(true, () => {
      isKitchenImaginationRef.current = true;
      setIsKitchenImagination(true);
      houseSceneRef.current?.setKitchenImaginationMode(true);

      onSubtitleChangeRef.current?.(
        'Zane',
        '“Command, I have the access card. Heading for the bunker.”'
      );
      soundEngine.speakLine(
        'Command, I have the access card. Heading for the bunker.',
        'zane'
      );
      soundEngine.playRadioStatic();
    });
  }, [triggerImaginationWipe]);

  // Check ?dev=1 in URL for Developer Menu
  const isDevEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('dev') === '1' || window.location.search.includes('dev=1');
  }, []);

  const [isDevMenuOpen, setIsDevMenuOpen] = useState<boolean>(false);
  const [noclip, setNoclip] = useState<boolean>(false);
  const noclipRef = useRef<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const speedMultiplierRef = useRef<number>(1);
  const lastSafePos = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 1.8));
  const snapshotRef = useRef<{
    storyState: StoryState;
    playerPos: [number, number, number];
    playerRot: number;
    camYaw: number;
  } | null>(null);

  const [fpsVal, setFpsVal] = useState<number>(60);
  const [frameTimeVal, setFrameTimeVal] = useState<number>(16.6);
  const [errorCount, setErrorCount] = useState<number>(0);

  useEffect(() => {
    const handleError = () => setErrorCount((c) => c + 1);
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleError);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleError);
    };
  }, []);

  const lastGameLoopBranchRef = useRef<string>('gameplay');
  const [devDiagnostics, setDevDiagnostics] = useState({
    cameraPosition: '0.0, 0.0, 0.0',
    cameraLookTarget: '0.0, 0.0, 0.0',
    cameraYaw: 0,
    cameraPitch: 0,
    cameraDistance: 0,
    lastGameLoopBranch: 'gameplay',
    cinematicState: 'gameplay',
    blockedReasons: [] as string[],
    activeColliderSetName: 'real',
    touchingCollider: 'None',
    sceneVisibilities: {
      battlefield: false,
      bedroom: true,
      house: false,
      workshop: false,
      restroom: false,
      basement: false,
    },
    visibleRealGroupsCount: 1,
    battlefieldVisible: false,
    drawCallCount: 0,
    triangleCount: 0,
    ambientIntensity: 0.9,
    hemiIntensity: 0.8,
    dirIntensity: 1.6,
    exposure: 1.3,
    fogDensity: '0.012',
    backgroundColor: '#0b1830',
    visibleLightsCount: 4,
    forwardVector: '(0.00, 0.00, 0.00)',
    rightVector: '(0.00, 0.00, 0.00)',
    heldKeys: [] as string[],
    isRightInverted: false,
  });

  useEffect(() => {
    if (!isDevMenuOpen) return;

    const interval = setInterval(() => {
      const cam = cameraRef.current;
      const target = currentLookTarget.current;
      const pPos = playerPos.current;

      const camPosStr = cam ? `${cam.position.x.toFixed(1)}, ${cam.position.y.toFixed(1)}, ${cam.position.z.toFixed(1)}` : '0, 0, 0';
      const lookStr = target ? `${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)}` : '0, 0, 0';
      const yawVal = cameraYaw.current;
      const pitchVal = cameraPitch.current;
      const distVal = cam && pPos ? cam.position.distanceTo(pPos) : 0;
      const loopBranch = lastGameLoopBranchRef.current || 'gameplay';
      const cinState = cinematicRef.current?.state || 'gameplay';

      const reasons: string[] = [];
      if (cinematicRef.current?.state !== 'gameplay') reasons.push('cinematic playing');
      if (isDialogueActive) reasons.push('dialogue active');
      if (isChoiceActive) reasons.push('choice active');
      if (isTransitioningRef.current) reasons.push('transitioning');
      if (activeInspectModal) reasons.push('inspect mode');
      if (isPowerRestoreOpen || isQuietHandsOpen || isDevMenuOpen) reasons.push('overlay/minigame open');
      if (isPaused) reasons.push('paused');

      const activeColl = worldModeRef.current === 'imagination' ? 'battlefield' : 'house';
      const bfVis = Boolean(battlefieldSceneRef.current?.group.visible);
      const bedVis = Boolean(bedroomSceneRef.current?.group.visible);
      const houseVis = Boolean(houseSceneRef.current?.group.visible);
      const workVis = Boolean(workshopSceneRef.current?.group.visible);
      const restVis = Boolean(restroomSceneRef.current?.group.visible);
      const baseVis = Boolean(basementSceneRef.current?.group.visible);

      const realGroupsCount = [bedVis, houseVis, workVis, restVis, baseVis].filter(Boolean).length;
      const rendererObj = rendererRef.current;
      const calls = rendererObj?.info.render.calls || 0;
      const triangles = rendererObj?.info.render.triangles || 0;

      const isDepotActive = Boolean(
        battlefieldSceneRef.current?.group.visible ||
        worldModeRef.current === 'imagination' ||
        battlefieldSceneRef.current?.supplyDepotGroup.visible
      );

      const ambInt = isDepotActive
        ? (depotAmbientLightRef.current?.intensity ?? 0.9)
        : (globalAmbientLightRef.current?.intensity ?? 0.85);
      const hemiInt = isDepotActive
        ? (depotHemiLightRef.current?.intensity ?? 0.8)
        : (globalHemiLightRef.current?.intensity ?? 0.50);
      const dirInt = isDepotActive
        ? (depotDirLightRef.current?.intensity ?? 1.6)
        : (globalDirLightRef.current?.intensity ?? 1.8);
      const expVal = rendererRef.current?.toneMappingExposure ?? (isDepotActive ? 1.3 : 0.8);

      let fogDensityStr = 'None';
      const curFog = sceneRef.current?.fog;
      if (curFog instanceof THREE.FogExp2) {
        fogDensityStr = `${curFog.density.toFixed(3)}`;
      } else if (curFog instanceof THREE.Fog) {
        fogDensityStr = `${curFog.near}-${curFog.far}`;
      }

      let bgColorStr = '#0b1830';
      const curBg = sceneRef.current?.background;
      if (curBg instanceof THREE.Color) {
        bgColorStr = `#${curBg.getHexString()}`;
      }

      let visibleLights = 0;
      sceneRef.current?.traverse((obj) => {
        if ((obj as THREE.Light).isLight && obj.visible && (obj as THREE.Light).intensity > 0) {
          visibleLights++;
        }
      });

      setDevDiagnostics({
        cameraPosition: camPosStr,
        cameraLookTarget: lookStr,
        cameraYaw: yawVal,
        cameraPitch: pitchVal,
        cameraDistance: distVal,
        lastGameLoopBranch: loopBranch,
        cinematicState: cinState,
        blockedReasons: reasons,
        activeColliderSetName: activeColl,
        touchingCollider: touchingColliderRef.current || 'None',
        sceneVisibilities: {
          battlefield: bfVis,
          bedroom: bedVis,
          house: houseVis,
          workshop: workVis,
          restroom: restVis,
          basement: baseVis,
        },
        visibleRealGroupsCount: realGroupsCount,
        battlefieldVisible: bfVis,
        drawCallCount: calls,
        triangleCount: triangles,
        ambientIntensity: ambInt,
        hemiIntensity: hemiInt,
        dirIntensity: dirInt,
        exposure: expVal,
        fogDensity: fogDensityStr,
        backgroundColor: bgColorStr,
        visibleLightsCount: visibleLights,
        forwardVector: `(${forwardVecRef.current.x.toFixed(2)}, ${forwardVecRef.current.y.toFixed(2)}, ${forwardVecRef.current.z.toFixed(2)})`,
        rightVector: `(${rightVecRef.current.x.toFixed(2)}, ${rightVecRef.current.y.toFixed(2)}, ${rightVecRef.current.z.toFixed(2)})`,
        heldKeys: heldKeysRef.current,
        isRightInverted: isRightInvertedRef.current,
      });
    }, 200); // 5 Hz

    const logInterval = setInterval(() => {
      const diag = devDiagnostics;
      console.log(`[DIAG] Mode: ${worldModeRef.current}, Room: ${currentLocation}, Pos: (${diag.cameraPosition}), BF Vis: ${diag.battlefieldVisible}, Real Groups: ${diag.visibleRealGroupsCount}, Loop: ${diag.lastGameLoopBranch}, Blocked: [${diag.blockedReasons.join(', ')}], Calls: ${diag.drawCallCount}, Tris: ${diag.triangleCount}`);
    }, 1000); // 1 Hz

    return () => {
      clearInterval(interval);
      clearInterval(logInterval);
    };
  }, [isDevMenuOpen, currentLocation, isDialogueActive, isChoiceActive, activeInspectModal, isPowerRestoreOpen, isQuietHandsOpen, isPaused, devDiagnostics]);

  // Developer Menu Action Handlers
  const handleDevTeleport = useCallback((target: 'bedroom' | 'hallway' | 'kitchen' | 'living_room' | 'workshop' | 'restroom' | 'basement_top' | 'basement_bottom' | 'battlefield' | 'depot_start' | 'real_kitchen') => {
    // Disable dev teleports while ending cutscene is active
    if (isBeerCutsceneActiveRef.current) return;

    if (target === 'battlefield' || target === 'depot_start') {
      triggerImaginationWipe(true, () => {
        setWorldMode('imagination', 'devTeleport', { spawn: new THREE.Vector3(500, 0, -12) });
      });
      return;
    }
    if (target === 'real_kitchen') {
      if (battlefieldSceneRef.current?.group.visible) {
        triggerImaginationWipe(false, () => {
          setWorldMode('real', 'devTeleport');
        });
      } else {
        setWorldMode('real', 'devTeleport');
      }
      playerPos.current.set(-5.0, 0, 16.5);
      if (characterRef.current) characterRef.current.group.position.copy(playerPos.current);
      playerRotation.current = Math.PI / 2;
      cameraYaw.current = Math.PI / 2;
      cameraPitch.current = 0.15;
      if (cameraRef.current) {
        cameraRef.current.position.set(
          playerPos.current.x - Math.sin(Math.PI / 2) * 4.0 * Math.cos(0.15),
          playerPos.current.y + 1.2 + Math.sin(0.15) * 4.0,
          playerPos.current.z - Math.cos(Math.PI / 2) * 4.0 * Math.cos(0.15)
        );
        cameraRef.current.lookAt(playerPos.current.x, playerPos.current.y + 1.0, playerPos.current.z);
      }
      return;
    }
    if (battlefieldSceneRef.current?.group.visible) {
      triggerImaginationWipe(false, () => {
        setWorldMode('real', 'devTeleport');
      });
    }
    switch (target) {
      case 'bedroom':
        playerPos.current.set(0, 0, 1.8);
        playerRotation.current = Math.PI;
        cameraYaw.current = Math.PI;
        break;
      case 'hallway':
        if (bedroomDoorRef.current) bedroomDoorRef.current.open();
        playerPos.current.set(0, 0, 8.5);
        playerRotation.current = Math.PI;
        cameraYaw.current = Math.PI;
        break;
      case 'kitchen':
        playerPos.current.set(-5.0, 0, 16.5);
        playerRotation.current = Math.PI / 2;
        cameraYaw.current = Math.PI / 2;
        break;
      case 'living_room':
        playerPos.current.set(5.0, 0, 16.5);
        playerRotation.current = -Math.PI / 2;
        cameraYaw.current = -Math.PI / 2;
        break;
      case 'workshop':
        if (workshopDoorRef.current) {
          workshopDoorRef.current.setLocked(false);
          workshopDoorRef.current.open();
        }
        playerPos.current.set(-5.0, 0, 7.5);
        playerRotation.current = 0;
        cameraYaw.current = 0;
        break;
      case 'restroom':
        if (restroomDoorRef.current) {
          restroomDoorRef.current.setLocked(false);
          restroomDoorRef.current.open();
        }
        playerPos.current.set(0, 0, 21.5);
        playerRotation.current = 0;
        cameraYaw.current = 0;
        break;
      case 'basement_top':
        if (basementDoorRef.current) {
          basementDoorRef.current.setLocked(false);
          basementDoorRef.current.open();
        }
        playerPos.current.set(1.5, 0, 11.0);
        playerRotation.current = Math.PI / 2;
        cameraYaw.current = Math.PI / 2;
        break;
      case 'basement_bottom':
        if (basementDoorRef.current) {
          basementDoorRef.current.setLocked(false);
          basementDoorRef.current.open();
        }
        playerPos.current.set(8.0, -3.2, 11.0);
        playerRotation.current = Math.PI / 2;
        cameraYaw.current = Math.PI / 2;
        break;
    }
    lastSafePos.current.copy(playerPos.current);
    onTelltaleNotificationRef.current?.(`Teleported to ${target}`);
  }, [triggerImaginationWipe]);

  const handleDevSetQuestStatus = useCallback((questId: QuestId, status: QuestStatus) => {
    const updated = {
      ...storyStateRef.current,
      quests: {
        ...storyStateRef.current.quests,
        [questId]: status,
      },
    };
    storyStateRef.current = updated;
    onStoryStateChangeRef.current?.(updated);
  }, []);

  const handleDevCompleteQuestsUpTo = useCallback((questId: QuestId) => {
    const updated = { ...storyStateRef.current };
    if (questId === 'get_wrench') {
      updated.quests.get_wrench = 'active';
      updated.quests.hallway_pictures = 'inactive';
      updated.quests.kitchen_key = 'inactive';
      updated.quests.basement_wrench = 'inactive';
    } else if (questId === 'hallway_pictures') {
      updated.quests.get_wrench = 'completed';
      updated.quests.hallway_pictures = 'active';
      updated.quests.kitchen_key = 'inactive';
      updated.quests.basement_wrench = 'inactive';
      if (bedroomDoorRef.current) bedroomDoorRef.current.open();
    } else if (questId === 'kitchen_key') {
      updated.quests.get_wrench = 'completed';
      updated.quests.hallway_pictures = 'completed';
      updated.quests.kitchen_key = 'active';
      updated.quests.basement_wrench = 'inactive';
      if (bedroomDoorRef.current) bedroomDoorRef.current.open();
      houseSceneRef.current?.hallwayPanels.forEach((p) => {
        p.isAligned = true;
        p.currentAngle = 0;
        p.pivot.rotation.z = 0;
        p.glowingEdge.visible = false;
        p.interactionNode.name = 'Framed Photo';
        p.interactionNode.promptVerb = 'Look';
      });
    } else if (questId === 'basement_wrench') {
      updated.quests.get_wrench = 'completed';
      updated.quests.hallway_pictures = 'completed';
      updated.quests.kitchen_key = 'completed';
      updated.quests.basement_wrench = 'active';
      updated.quests.deliver_wrench = 'inactive';
      updated.hasKey = true;
      houseSceneRef.current?.hideKey();
      if (bedroomDoorRef.current) bedroomDoorRef.current.open();
      if (basementDoorRef.current) {
        basementDoorRef.current.setLocked(false);
        basementDoorRef.current.open();
      }
      houseSceneRef.current?.hallwayPanels.forEach((p) => {
        p.isAligned = true;
        p.currentAngle = 0;
        p.pivot.rotation.z = 0;
        p.glowingEdge.visible = false;
        p.interactionNode.name = 'Framed Photo';
        p.interactionNode.promptVerb = 'Look';
      });
    } else if (questId === 'deliver_wrench') {
      updated.quests.get_wrench = 'completed';
      updated.quests.hallway_pictures = 'completed';
      updated.quests.kitchen_key = 'completed';
      updated.quests.basement_wrench = 'completed';
      updated.quests.deliver_wrench = 'active';
      updated.hasKey = true;
      updated.hasPower = true;
      updated.hasWrench = true;
      houseSceneRef.current?.hideKey();
      basementSceneRef.current?.revealWrench();
      if (bedroomDoorRef.current) bedroomDoorRef.current.open();
      if (basementDoorRef.current) {
        basementDoorRef.current.setLocked(false);
        basementDoorRef.current.open();
      }
      if (workshopDoorRef.current) {
        workshopDoorRef.current.setLocked(false);
        workshopDoorRef.current.open();
      }
      houseSceneRef.current?.hallwayPanels.forEach((p) => {
        p.isAligned = true;
        p.currentAngle = 0;
        p.pivot.rotation.z = 0;
        p.glowingEdge.visible = false;
        p.interactionNode.name = 'Framed Photo';
        p.interactionNode.promptVerb = 'Look';
      });
    }
    storyStateRef.current = updated;
    onStoryStateChangeRef.current?.(updated);
    onTelltaleNotificationRef.current?.(`Set quests up to ${questId}`);
  }, []);

  const handleDevToggleInventory = useCallback((item: 'key' | 'flashlight' | 'wrench' | 'power' | 'photoChoice') => {
    const updated = { ...storyStateRef.current };
    if (item === 'key') {
      updated.hasKey = !updated.hasKey;
      if (updated.hasKey) {
        houseSceneRef.current?.hideKey();
        if (basementDoorRef.current) basementDoorRef.current.setLocked(false);
      }
    } else if (item === 'flashlight') {
      // Flashlight mechanic removed
      return;
    } else if (item === 'wrench') {
      updated.hasWrench = !updated.hasWrench;
      if (updated.hasWrench) {
        basementSceneRef.current?.hideWrench();
        updated.quests.basement_wrench = 'completed';
        updated.quests.deliver_wrench = 'active';
        if (workshopDoorRef.current) {
          workshopDoorRef.current.setLocked(false);
          workshopDoorRef.current.interactionNode.promptVerb = 'Open';
        }
      } else {
        updated.quests.deliver_wrench = 'inactive';
      }
    } else if (item === 'power') {
      updated.hasPower = !updated.hasPower;
      if (updated.hasPower) {
        updated.quests.basement_wrench = 'active';
        basementSceneRef.current?.revealWrench();
      } else {
        basementSceneRef.current?.hideWrench();
      }
      onTelltaleNotificationRef.current?.(updated.hasPower ? 'Power Restored' : 'Power Cut');
    } else if (item === 'photoChoice') {
      updated.photoChoice = updated.photoChoice === 'taken' ? 'left' : updated.photoChoice === 'left' ? undefined : 'taken';
    }
    storyStateRef.current = updated;
    onStoryStateChangeRef.current?.(updated);
  }, []);

  const handleSofaSeatOffsetChange = useCallback((offset: { x: number; y: number; z: number; rotY: number }) => {
    setSofaSeatOffset(offset);
    sofaSeatOffsetRef.current = offset;
    if (dadCharacterRef.current) {
      dadCharacterRef.current.updateSeatOffset(offset);
    }
  }, []);

  const handleDevTriggerCutscene = useCallback((type: 'intro' | 'hallway' | 'skip_intro') => {
    if (type === 'intro') {
      triggerImaginationWipe(true);
    } else if (type === 'skip_intro') {
      triggerImaginationWipe(false, () => {
        playerPos.current.set(0, 0, 1.8);
        playerRotation.current = Math.PI;
        cameraYaw.current = Math.PI;
      });
    } else if (type === 'hallway') {
      onSubtitleChangeRef.current?.(
        'Zane',
        '“...Crooked. Ugh, I can’t walk past that.”'
      );
      soundEngine.speakLine("...Crooked. Ugh, I can't walk past that.", 'zane');
      setTimeout(() => {
        triggerImaginationWipe(true, () => {
          isHallwayImaginationRef.current = true;
          setIsHallwayImagination(true);
          houseSceneRef.current?.setImaginationMode(true);
        });
      }, 1000);
    }
  }, [triggerImaginationWipe]);

  const handleDevSaveSnapshot = useCallback(() => {
    const snap = {
      storyState: JSON.parse(JSON.stringify(storyStateRef.current)),
      playerPos: playerPos.current.toArray() as [number, number, number],
      playerRot: playerRotation.current,
      camYaw: cameraYaw.current,
    };
    snapshotRef.current = snap;
    try {
      localStorage.setItem('zane_game_snapshot', JSON.stringify(snap));
    } catch {
      // ignore
    }
    onTelltaleNotificationRef.current?.('State Snapshot Saved');
  }, []);

  const handleDevLoadSnapshot = useCallback(() => {
    let snap = snapshotRef.current;
    if (!snap) {
      try {
        const str = localStorage.getItem('zane_game_snapshot');
        if (str) snap = JSON.parse(str);
      } catch {
        // ignore
      }
    }
    if (snap) {
      storyStateRef.current = snap.storyState;
      playerPos.current.fromArray(snap.playerPos);
      playerRotation.current = snap.playerRot;
      cameraYaw.current = snap.camYaw ?? snap.playerRot;
      onStoryStateChangeRef.current?.(snap.storyState);
      onTelltaleNotificationRef.current?.('Snapshot Loaded');
    }
  }, []);

  const handleDevResetEverything = useCallback(() => {
    const defaultState: StoryState = {
      completedCutscenes: {},
      quests: {
        get_wrench: 'active',
        hallway_pictures: 'inactive',
        kitchen_key: 'inactive',
        basement_wrench: 'inactive',
        deliver_wrench: 'inactive',
        kitchen_beer: 'inactive',
      },
      triggeredZones: {},
      openingPlayed: false,
      hasKey: false,
      hasWrench: false,
      hasFlashlight: false,
    };
    storyStateRef.current = defaultState;
    playerPos.current.set(0, 0, 1.8);
    playerRotation.current = Math.PI;
    cameraYaw.current = Math.PI;

    if (battlefieldSceneRef.current?.group.visible) {
      triggerImaginationWipe(false);
    }
    onStoryStateChangeRef.current?.(defaultState);
    onTelltaleNotificationRef.current?.('Game State Reset');
  }, [triggerImaginationWipe]);

  // Setup Three.js scene (Runs ONCE on mount)
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const showDebugRef = useRef<boolean>(false);

  // Debug HUD state
  const [debugHudData, setDebugHudData] = useState({
    keys: '',
    pointerLocked: false,
    lookMode: 'Locked',
    gameState: '',
    pos: '0, 0, 0',
    camYaw: '0.00',
    charYaw: '0.00',
    nearestDoor: 'None',
    lightingInfo: 'Room: bedroom | Lights: 0 | Ambient: 0.85',
    cutsceneDebug: '',
    projectileDebug: '',
    questDebug: '',
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const activeKeys = Object.keys(keysPressed.current)
        .filter((k) => keysPressed.current[k])
        .join(', ');
      const target = wrapperRef.current || containerRef.current;
      const isLocked = Boolean(
        document.pointerLockElement &&
          (document.pointerLockElement === target ||
            document.pointerLockElement === containerRef.current)
      );

      let nearestDoorStr = 'None';
      const doors = [bedroomDoorRef.current, workshopDoorRef.current, basementDoorRef.current, restroomDoorRef.current].filter(Boolean) as InteractiveDoor[];
      let minDist = Infinity;
      let closestDoor: InteractiveDoor | null = null;
      for (const door of doors) {
        const d = playerPos.current.distanceTo(door.position);
        if (d < minDist) {
          minDist = d;
          closestDoor = door;
        }
      }
      if (closestDoor) {
        const rotDeg = (closestDoor.pivotGroup.rotation.y * 180 / Math.PI).toFixed(1);
        const colliderActive = closestDoor.getCollider() !== null;
        const roomVis = closestDoor.targetRoomGroup.visible;
        nearestDoorStr = `${closestDoor.name}: isOpen=${closestDoor.isOpen}, rotY=${rotDeg}°, colliderActive=${colliderActive}, roomVis=${roomVis}`;
      }

      let activeLightCount = 0;
      if (sceneRef.current) {
        sceneRef.current.traverse((obj) => {
          if ((obj as THREE.Light).isLight && obj.visible) {
            activeLightCount++;
          }
        });
      }
      const ambInt = globalAmbientLightRef.current ? globalAmbientLightRef.current.intensity.toFixed(2) : '0.85';
      const lightingInfoStr = `Room: ${currentRoomRef.current} | Lights: ${activeLightCount} | Ambient: ${ambInt}`;

      let cutsceneDebugStr = '';
      if (cinematicRef.current && cinematicRef.current.state !== 'gameplay') {
        const groundY = battlefieldSceneRef.current ? battlefieldSceneRef.current.getGroundY(playerPos.current.x, playerPos.current.z) : 0;
        const charY = characterRef.current ? characterRef.current.group.position.y : 0;
        const camY = cameraRef.current ? cameraRef.current.position.y : 0;
        const cTime = cinematicRef.current.elapsedTime;
        cutsceneDebugStr = `Ground Y: ${groundY.toFixed(3)} | Char Y: ${charY.toFixed(3)} | Cam Y: ${camY.toFixed(3)} | Cutscene Time: ${cTime.toFixed(2)}s`;
      }

      let projectileDebugStr = '';
      if (battlefieldSceneRef.current) {
        const activeCount = battlefieldSceneRef.current.getActiveProjectileCount();
        const isVis = battlefieldSceneRef.current.projectileGroup ? battlefieldSceneRef.current.projectileGroup.visible : false;
        projectileDebugStr = `Active: ${activeCount} | Visible: ${isVis ? 'Yes' : 'No'}`;
      }

      const q = storyStateRef.current.quests;
      const questDebugStr = `get_wrench: ${q.get_wrench} | hallway: ${q.hallway_pictures} | key: ${q.kitchen_key} | basement: ${q.basement_wrench}`;

      setDebugHudData({
        keys: activeKeys || 'None',
        pointerLocked: isLocked,
        lookMode: isLocked ? 'Locked' : lookModeRef.current === 'drag' ? 'Drag' : 'Locked',
        gameState: (isCinematicPlaying || (cinematicRef.current && cinematicRef.current.state !== 'gameplay')) ? 'Cinematic' : isDialogueActive ? 'Dialogue' : inspectMode.current !== 'none' ? `Inspect (${inspectMode.current})` : 'Gameplay',
        pos: `${playerPos.current.x.toFixed(2)}, ${playerPos.current.y.toFixed(2)}, ${playerPos.current.z.toFixed(2)}`,
        camYaw: cameraYaw.current.toFixed(2),
        charYaw: playerRotation.current.toFixed(2),
        nearestDoor: nearestDoorStr,
        lightingInfo: lightingInfoStr,
        cutsceneDebug: cutsceneDebugStr,
        projectileDebug: projectileDebugStr,
        questDebug: questDebugStr,
      });
    }, 150);
    return () => clearInterval(timer);
  }, [isCinematicPlaying, isDialogueActive, currentLocation]);

  // Reset pressed keys on state or location changes
  useEffect(() => {
    keysPressed.current = {};
  }, [isCinematicPlaying, isDialogueActive, currentLocation]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.3, 80);
    camera.position.set(0, 2.5, 4.5);
    camera.updateProjectionMatrix();
    cameraRef.current = camera;
    scene.add(camera);

    // 3. Renderer with antialiasing, logarithmic depth buffer, and painterly soft shadows (reuse singleton or create once)
    const currentSettings = loadSettings();
    const quality = currentSettings.graphicsQuality || 'Medium';
    const pixelRatio = quality === 'High' ? 2 : (quality === 'Medium' ? 1.5 : 1);

    let renderer = cachedRenderer;
    if (!renderer || (renderer as any).capabilities?.logarithmicDepthBuffer !== true) {
      if (renderer) renderer.dispose();
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(pixelRatio);
      renderer.shadowMap.enabled = quality !== 'Low';
      if (renderer.shadowMap.enabled) {
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.8;
      cachedRenderer = renderer;
    } else {
      renderer.setSize(width, height);
      renderer.setPixelRatio(pixelRatio);
      renderer.shadowMap.enabled = quality !== 'Low';
      renderer.toneMappingExposure = 0.8;
    }
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Cyber Post-Processing Pipeline (single renderer, enabled only during imagination)
    const cyberPipeline = new CyberPostprocessingPipeline(renderer, scene, camera, width, height);
    cyberPostPipelineRef.current = cyberPipeline;

    // 4. Instantiate Sub-scenes & Doors for One Continuous World
    const bedroom = new BedroomScene();
    const houseMap = new HouseMapScene();
    const workshop = new WorkshopScene();
    const restroom = new RestroomScene();
    const basement = new BasementScene();
    const battlefield = new BattlefieldScene();
    const character = new CharacterModel();
    const dad = new DadCharacter();

    bedroomSceneRef.current = bedroom;
    houseSceneRef.current = houseMap;
    workshopSceneRef.current = workshop;
    restroomSceneRef.current = restroom;
    basementSceneRef.current = basement;
    battlefieldSceneRef.current = battlefield;
    characterRef.current = character;
    dadCharacterRef.current = dad;

    // Compute explicit living room anchors from actual meshes and configure Dad's path and sitting position
    const livingRoomAnchors = houseMap.computeLivingRoomAnchors(sofaSeatOffsetRef.current);
    dad.setLivingRoomAnchors(livingRoomAnchors, houseMap.colliders);

    // Log Basement Stairs Debug Information (Requirement 1)
    basement.logStairsDebug();

    // Build Reusable Interactive Doors
    const bedroomDoor = new InteractiveDoor({
      id: 'bedroom_door',
      name: 'Bedroom Door',
      position: new THREE.Vector3(-0.65, 0, 4.5),
      targetRoomId: 'hallway',
      targetRoomGroup: houseMap.group,
      doorColor: 0xa16207,
    });

    const workshopDoor = new InteractiveDoor({
      id: 'house_workshop',
      name: "Dad's Workshop",
      position: new THREE.Vector3(-1.8, 0, 6.85),
      rotationY: Math.PI / 2,
      targetRoomId: 'workshop',
      targetRoomGroup: workshop.group,
      doorColor: 0xa16207,
      isLocked: true,
      lockedMessage: 'Dad is in the Workshop',
    });

    const basementDoor = new InteractiveDoor({
      id: 'house_basement',
      name: 'Basement Door',
      position: new THREE.Vector3(1.8, 0, 10.35),
      rotationY: -Math.PI / 2,
      targetRoomId: 'basement',
      targetRoomGroup: basement.group,
      doorColor: 0x92400e,
      isLocked: !storyStateRef.current.hasKey,
      lockedMessage: 'Locked. The key has to be somewhere in the house.',
      interactRadius: 2.8,
    });

    const restroomDoor = new InteractiveDoor({
      id: 'house_restroom',
      name: 'Restroom Door',
      position: new THREE.Vector3(-0.65, 0, 19.5),
      targetRoomId: 'restroom',
      targetRoomGroup: restroom.group,
      doorColor: 0xf8fafc,
    });

    bedroomDoorRef.current = bedroomDoor;
    workshopDoorRef.current = workshopDoor;
    basementDoorRef.current = basementDoor;
    restroomDoorRef.current = restroomDoor;

    if (storyStateRef.current.hasKey) {
      basementDoor.setLocked(false);
      basementDoor.interactionNode.promptVerb = 'Open';
      basementDoor.interactionNode.name = 'Basement Door';
      basementDoor.interactionNode.description = 'Press E to open Basement Door.';
      houseMap.hideKey();
    } else {
      basementDoor.interactionNode.promptVerb = 'Check';
    }

    if (storyStateRef.current.hasWrench || storyStateRef.current.quests.deliver_wrench === 'active' || storyStateRef.current.quests.deliver_wrench === 'completed') {
      workshopDoor.setLocked(false);
      workshopDoor.interactionNode.promptVerb = 'Open';
      workshopDoor.interactionNode.name = "Dad's Workshop";
      workshopDoor.interactionNode.description = "Press E to open Dad's Workshop door.";
    }

    if (storyStateRef.current.hasPower && !storyStateRef.current.hasWrench) {
      basement.revealWrench();
    }
    if (storyStateRef.current.hasWrench) {
      basement.hideWrench();
    }
    if (storyStateRef.current.quests.deliver_wrench === 'completed') {
      workshop.placeWrench();
    }

    // Global Base Lighting (ALWAYS ON across all real-world rooms and doorways)
    const globalAmbient = new THREE.AmbientLight(0xffedd5, 0.85);
    globalAmbient.name = 'GlobalAmbientLight';
    globalAmbientLightRef.current = globalAmbient;

    const globalHemi = new THREE.HemisphereLight(0xfff1db, 0xd4a373, 0.50);
    globalHemi.name = 'GlobalHemisphereLight';
    globalHemiLightRef.current = globalHemi;

    const shadowMapSize = quality === 'High' ? 2048 : (quality === 'Medium' ? 1024 : 0);
    const globalDir = new THREE.DirectionalLight(0xffe8ba, 1.8);
    globalDir.name = 'GlobalDirectionalLight';
    globalDir.castShadow = quality !== 'Low';
    globalDir.shadow.mapSize.width = shadowMapSize;
    globalDir.shadow.mapSize.height = shadowMapSize;
    globalDir.shadow.camera.near = 0.5;
    globalDir.shadow.camera.far = 30.0;
    globalDir.shadow.camera.left = -7.0;
    globalDir.shadow.camera.right = 7.0;
    globalDir.shadow.camera.top = 7.0;
    globalDir.shadow.camera.bottom = -7.0;
    globalDir.shadow.camera.updateProjectionMatrix();
    globalDir.shadow.bias = -0.0008;
    globalDir.shadow.normalBias = 0.04;
    globalDir.shadow.radius = 2.0;
    globalDirLightRef.current = globalDir;



    scene.add(globalAmbient, globalHemi, globalDir, globalDir.target);

    // Dedicated Supply Depot & Battlefield Lights (created once, kept for the whole session, never removed)
    const depotAmbient = new THREE.AmbientLight(0x4a6a9a, 0.9);
    depotAmbient.name = 'DepotAmbientLight';
    scene.add(depotAmbient);
    depotAmbientLightRef.current = depotAmbient;

    const depotHemi = new THREE.HemisphereLight(0x6f8fcf, 0x1a2238, 0.8);
    depotHemi.name = 'DepotHemisphereLight';
    scene.add(depotHemi);
    depotHemiLightRef.current = depotHemi;

    const depotDir = new THREE.DirectionalLight(0x9fd8ff, 1.6);
    depotDir.name = 'DepotDirectionalLight';
    depotDir.castShadow = false;
    depotDir.shadow.mapSize.width = 2048;
    depotDir.shadow.mapSize.height = 2048;
    scene.add(depotDir);
    scene.add(depotDir.target);
    depotDirLightRef.current = depotDir;

    const depotCounter = new THREE.DirectionalLight(0xf97316, 0.7);
    depotCounter.name = 'DepotOrangeCounterLight';
    scene.add(depotCounter);
    scene.add(depotCounter.target);
    depotCounterLightRef.current = depotCounter;

    scene.add(battlefield.group);
    scene.add(bedroom.group);
    scene.add(houseMap.group);
    scene.add(workshop.group);
    scene.add(restroom.group);
    scene.add(basement.group);

    scene.add(bedroomDoor.pivotGroup);
    scene.add(bedroomDoor.frameGroup);
    scene.add(workshopDoor.pivotGroup);
    scene.add(workshopDoor.frameGroup);
    scene.add(basementDoor.pivotGroup);
    scene.add(basementDoor.frameGroup);
    scene.add(restroomDoor.pivotGroup);
    scene.add(restroomDoor.frameGroup);

    // Build Invisible Trigger Zones with wireframe helpers for backtick debug view
    const triggerZones: {
      id: string;
      name: string;
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
      minY: number;
      maxY: number;
      helper: THREE.LineSegments;
      onEnter: () => void;
    }[] = [];

    const createTriggerHelper = (minX: number, maxX: number, minZ: number, maxZ: number, minY = 0, maxY = 2.5, color = 0x38bdf8) => {
      const width = maxX - minX;
      const height = maxY - minY;
      const depth = maxZ - minZ;
      const boxGeo = new THREE.BoxGeometry(width, height, depth);
      const wireGeo = new THREE.WireframeGeometry(boxGeo);
      const wireMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
      const line = new THREE.LineSegments(wireGeo, wireMat);
      line.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
      line.visible = false;
      scene.add(line);
      return line;
    };

    // 1. Hallway Pictures Zone (triggered by entering the middle of the hallway)
    triggerZones.push({
      id: 'zone_hallway',
      name: 'Hallway Pictures Zone',
      minX: -1.2,
      maxX: 1.2,
      minZ: 7.0,
      maxZ: 8.5,
      minY: 0,
      maxY: 2.5,
      helper: createTriggerHelper(-1.2, 1.2, 7.0, 8.5, 0, 2.5, 0x38bdf8),
      onEnter: () => {
        if (
          storyStateRef.current.quests.hallway_pictures === 'active' &&
          !isHallwayImaginationRef.current &&
          alignedPanelsCountRef.current < 2
        ) {
          onSubtitleChangeRef.current?.(
            'Zane',
            '“...Crooked. Ugh, I can’t walk past that.”'
          );
          soundEngine.speakLine("...Crooked. Ugh, I can't walk past that.", 'zane');

          setTimeout(() => {
            triggerImaginationWipe(true, () => {
              isHallwayImaginationRef.current = true;
              setIsHallwayImagination(true);
              houseSceneRef.current?.setImaginationMode(true);
            });

            setTimeout(() => {
              onSubtitleChangeRef.current?.(
                'Zane',
                '“Command, hull panels are out of alignment. I’m on it.”'
              );
              soundEngine.speakLine(
                "Command, hull panels are out of alignment. I'm on it.",
                'zane'
              );
              soundEngine.playRadioStatic();
            }, 300);
          }, 1200);
        }
      },
    });

    // 2. Kitchen Key Zone
    triggerZones.push({
      id: 'zone_kitchen',
      name: 'Kitchen Key Zone',
      minX: -8.0,
      maxX: -2.0,
      minZ: 13.8,
      maxZ: 19.2,
      minY: 0,
      maxY: 2.5,
      helper: createTriggerHelper(-8.0, -2.0, 13.8, 19.2, 0, 2.5, 0xfacc15),
      onEnter: () => {
        if (storyStateRef.current.quests.kitchen_key === 'active' && !storyStateRef.current.hasKey) {
          onSubtitleChangeRef.current?.(
            'Zane',
            '“The kitchen... The basement key should be on the counter near the fruit bowl.”'
          );
          soundEngine.speakLine(
            'The kitchen... The basement key should be on the counter near the fruit bowl.',
            'zane'
          );
          onStoryStateChangeRef.current?.(storyStateRef.current);
        }
      },
    });

    // 3. Basement Stairs Debug Outline & Ramp (Backtick debug view)
    const stairsDebugHelper = createTriggerHelper(1.8, 6.0, 10.3, 11.7, -3.2, 0.0, 0x22c55e);

    // Collision ramp line representing getFloorY
    const rampPoints = [
      new THREE.Vector3(1.8, getFloorY(1.8, 11.0) + 0.04, 11.0),
      new THREE.Vector3(6.0, getFloorY(6.0, 11.0) + 0.04, 11.0),
      new THREE.Vector3(17.0, -3.2 + 0.04, 11.0),
    ];
    const rampGeo = new THREE.BufferGeometry().setFromPoints(rampPoints);
    const rampMat = new THREE.LineBasicMaterial({ color: 0x22c55e, linewidth: 3, transparent: true, opacity: 0.95 });
    const rampLine = new THREE.Line(rampGeo, rampMat);
    rampLine.visible = false;
    scene.add(rampLine);

    triggerZones.push({
      id: 'zone_stairs_debug',
      name: 'Basement Stairs Debug Ramp',
      minX: 1.8,
      maxX: 6.0,
      minZ: 10.3,
      maxZ: 11.7,
      minY: -3.2,
      maxY: 0.0,
      helper: stairsDebugHelper,
      onEnter: () => {},
    });

    // 4. Basement Wrench Zone
    triggerZones.push({
      id: 'zone_basement',
      name: 'Basement Wrench Zone',
      minX: 5.8,
      maxX: 17.0,
      minZ: 6.5,
      maxZ: 15.5,
      minY: -3.2,
      maxY: 0.0,
      helper: createTriggerHelper(5.8, 17.0, 6.5, 15.5, -3.2, 0.0, 0x10b981),
      onEnter: () => {
        if (storyStateRef.current.quests.basement_wrench === 'active' && !storyStateRef.current.hasWrench) {
          onSubtitleChangeRef.current?.(
            'Zane',
            '“Cold down here... Dad’s wrench is over on that storage bin.”'
          );
          soundEngine.speakLine(
            "Cold down here... Dad's wrench is over on that storage bin.",
            'zane'
          );
          onStoryStateChangeRef.current?.(storyStateRef.current);
        }
      },
    });

    triggerZonesRef.current = triggerZones;

    scene.add(character.group);
    scene.add(dad.group);

    // Set max anisotropy, linear mipmapping, and repeat wrapping on all scene textures to prevent aliasing
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat) => {
          if (mat && 'map' in mat && (mat as any).map) {
            const tex = (mat as any).map as THREE.Texture;
            tex.generateMipmaps = true;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.anisotropy = maxAnisotropy;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.needsUpdate = true;
          }
        });
      }
    });

    setWorldModeRef.current = setWorldMode;

    // 5. Cinematic Controller
    const cinematic = new CinematicController({
      onSubtitleChange: (speaker, text) => {
        onSubtitleChangeRef.current?.(speaker, text);
      },
      onFlashTransition: (toReality) => {
        triggerImaginationWipe(!toReality, () => {
          setWorldMode(toReality ? 'real' : 'imagination');
          if (toReality) {
            playerPos.current.set(0, 0, 1.8);
            playerRotation.current = Math.PI;
            cameraYaw.current = Math.PI;
            cameraPitch.current = 0;
          } else {
            playerPos.current.set(0, 0, 0);
            playerRotation.current = Math.PI;
            cameraYaw.current = Math.PI;
            cameraPitch.current = 0;
          }
        });
      },
      onControlsUnlocked: () => {
        onControlsUnlockedRef.current?.();
      },
      onCinematicComplete: (cutsceneId) => {
        onCutsceneCompleteRef.current?.(cutsceneId);
        onControlsUnlockedRef.current?.();
      },
      onTelltaleNotification: (text) => {
        onTelltaleNotificationRef.current?.(text);
        soundEngine.playTelltaleBell();
      },
      onExplosionPulse: (intensity) => {
        setExplosionPulseActive(true);
        setScreenShakeActive(true);
        setTimeout(() => setScreenShakeActive(false), 220);
        setTimeout(() => setExplosionPulseActive(false), 300);
      },
    });
    cinematicRef.current = cinematic;

    battlefield.onExplosionTrigger = (intensity) => {
      cinematic.addExplosionTrauma(intensity);
    };

    // Check if intro_prologue has already been completed
    if (!completedCutscenesRef.current?.intro_prologue) {
      setWorldMode('imagination');
      cinematic.startCutscene('intro_prologue', completedCutscenesRef.current);
    } else {
      setWorldMode('real');
      playerPos.current.set(0, 0, 1.8);
      playerRotation.current = Math.PI;
      cameraYaw.current = Math.PI;
      cameraPitch.current = 0;
      onControlsUnlockedRef.current?.();
    }

    // 6. Window Resize Listener
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
      cyberPostPipelineRef.current?.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Settings listener: apply graphics quality, shadow map size, fps cap, and master volume instantly!
    const applyLiveSettings = (s: GameSettings) => {
      fpsCapRef.current = s.fpsCap || 60;
      soundEngine.setMasterVolume(s.masterVolume ?? 0.8);

      const r = rendererRef.current;
      if (r) {
        const q = s.graphicsQuality || 'Medium';
        const pRatio = q === 'High' ? 2 : (q === 'Medium' ? 1.5 : 1);
        r.setPixelRatio(pRatio);
        r.shadowMap.enabled = q !== 'Low';

        const mapSize = q === 'High' ? 2048 : (q === 'Medium' ? 1024 : 0);
        if (globalDirLightRef.current) {
          globalDirLightRef.current.castShadow = q !== 'Low';
          if (q !== 'Low') {
            globalDirLightRef.current.shadow.mapSize.width = mapSize;
            globalDirLightRef.current.shadow.mapSize.height = mapSize;
            if (globalDirLightRef.current.shadow.map) {
              globalDirLightRef.current.shadow.map.dispose();
              (globalDirLightRef.current.shadow as any).map = null;
            }
          }
        }
        r.shadowMap.needsUpdate = true;
      }
    };

    const handleSettingsChanged = (e: any) => {
      const s = e.detail || loadSettings();
      applyLiveSettings(s);
    };
    window.addEventListener('game_settings_changed', handleSettingsChanged);

    // 7. Animation & Game Loop
    let animationFrameId: number;
    let lastTime = performance.now();

    // Reusable math vectors for 3D projection of floating crayon world labels
    const tempNodePos = new THREE.Vector3();
    const tempCamForward = new THREE.Vector3();
    const tempToNode = new THREE.Vector3();
    const tempProjected = new THREE.Vector3();

    const animate = (time: number) => {
      animationFrameId = requestAnimationFrame(animate);

      // Pause 3D animation loop / leave idle when puzzle overlay is open for light performance
      if (isPuzzleOpenRef.current) {
        lastTime = time;
        return;
      }

      if (isPausedRef.current || isQuietHandsOpenRef.current || isPowerRestoreOpenRef.current) {
        lastTime = time;
        const frameCap = fpsCapRef.current || 60;
        const minIntervalMs = 1000 / frameCap;
        if (time - lastRenderTimeRef.current >= minIntervalMs) {
          lastRenderTimeRef.current = time;
          renderer.render(scene, camera);
        }
        return;
      }

      const delta = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      // Dynamic FOV widen on imagination entry (+6 degrees, easing back over ~1 second)
      const baseFov = 55;
      if (fovBoostRef.current > 0.001) {
        fovBoostRef.current = Math.max(0, fovBoostRef.current - delta * 6.0);
      }
      const desiredFov = baseFov + fovBoostRef.current;
      if (Math.abs(camera.fov - desiredFov) > 0.02) {
        camera.fov = desiredFov;
        camera.updateProjectionMatrix();
      }

      // Glitch transition timer countdown
      if (glitchTimerRef.current > 0) {
        glitchTimerRef.current = Math.max(0, glitchTimerRef.current - delta);
      }
      const glitchIntensity = glitchTimerRef.current > 0 ? glitchTimerRef.current / 0.35 : 0.0;

      // Performance: monitor FPS and drop bloom pass to quarter resolution if FPS < 40
      fpsSamplesRef.current.frames++;
      fpsSamplesRef.current.time += delta;
      if (fpsSamplesRef.current.time >= 0.5) {
        const curFps = fpsSamplesRef.current.frames / fpsSamplesRef.current.time;
        const isLow = curFps < 40;
        if (isLow !== fpsSamplesRef.current.lowFps) {
          fpsSamplesRef.current.lowFps = isLow;
          cyberPostPipelineRef.current?.setLowPerformance(isLow);
        }
        fpsSamplesRef.current.frames = 0;
        fpsSamplesRef.current.time = 0;
      }

      // Update Sub-scenes & Parallax
      if (battlefield.group.visible) {
        const isRunning = character.currentState === 'RUN';
        const isSliding = character.currentState === 'SLIDE';
        battlefield.update(delta, playerPos.current, isRunning, isSliding);
      }
      if (battlefield.supplyDepotGroup.visible || isBeerCutsceneActiveRef.current) {
        battlefield.updateMonsterAnimation(delta);
      }
      if (bedroom.group.visible) {
        bedroom.update(delta);
        bedroom.updateParallax(camera.position);
      }
      if (houseMap.group.visible) houseMap.update(delta);
      dad.update(delta);

      if (dadCharacterRef.current) {
        dadCharacterRef.current.doorCheckCallback = (doorCenter) => {
          if (
            workshopDoorRef.current &&
            Math.abs(doorCenter.x - -1.8) < 0.2 &&
            Math.abs(doorCenter.z - 7.5) < 0.5
          ) {
            const door = workshopDoorRef.current;
            if (!door.isOpen) {
              return {
                isClosed: door.animProgress < 0.85,
                openDoor: () => {
                  if (door.isLocked) door.setLocked(false);
                  door.open(dadCharacterRef.current!.group.position);
                },
              };
            }
          }
          return null;
        };
      }

      // Handle Dad Beer Request Scene ("beerRequest" event sequence & heavy dread atmosphere)
      if (isBeerRequestActiveRef.current) {
        beerRequestTimerRef.current += delta;
        const phase = beerRequestPhaseRef.current;
        const sceneTime = beerRequestTimerRef.current;
        const isLivingRoom =
          currentRoomRef.current === 'living_room' ||
          playerPos.current.distanceTo(DadCharacter.LIVING_ROOM_SOFA_POS) < 7.5;
        const speaker = isLivingRoom ? 'Dad' : 'Dad (Living Room)';

        if (phase === 'tv_murmur') {
          if (sceneTime >= 2.0) {
            beerRequestPhaseRef.current = 'dad_request';
            beerRequestTimerRef.current = 0;
            // Dad says without turning: "Zane. Get me a beer."
            onSubtitleChangeRef.current?.(speaker, '“Zane. Get me a beer.”');
            soundEngine.speakLine('Zane. Get me a beer.', 'dad');
            onTriggerBeerRequestRef.current?.(handleBeerChoicePicked);
          }
        } else if (phase === 'near_silence') {
          if (sceneTime >= 1.2) {
            beerRequestPhaseRef.current = 'dad_shout';
            beerRequestTimerRef.current = 0;
            beerRequestPushInRef.current = 0;

            // Dad turns towards Zane / living room entrance and shouts
            if (dadCharacterRef.current) {
              if (isLivingRoom) {
                const dirX = playerPos.current.x - DadCharacter.LIVING_ROOM_SOFA_POS.x;
                const dirZ = playerPos.current.z - DadCharacter.LIVING_ROOM_SOFA_POS.z;
                dadCharacterRef.current.group.rotation.y = Math.atan2(dirX, dirZ);
              } else {
                dadCharacterRef.current.group.rotation.y = Math.PI / 2;
              }
              dadCharacterRef.current.yell();
            }

            onSubtitleChangeRef.current?.(speaker, '“ZANE!!! Are you disobeying me?”');
            soundEngine.speakLine('ZANE!!! Are you disobeying me?', 'dad');
            soundEngine.playShoutImpact();
            soundEngine.startHeavyAtmosphere();
          }
        } else if (phase === 'dad_shout') {
          const duration = 6.0;
          const progress = Math.min(1.0, sceneTime / duration);
          const decay = Math.max(0, 1.0 - Math.pow(progress, 0.9));
          const reduceMult = isReduceShakeEnabled() ? 0.3 : 1.0;

          // Decaying camera shake
          cameraShakeIntensityRef.current = decay * 0.22 * reduceMult;

          // 1 to 2 pixel CSS vibration at ~30 Hz
          const nowMs = performance.now();
          if (nowMs - lastVibeTimeRef.current >= 33) {
            lastVibeTimeRef.current = nowMs;
            if (decay > 0.01) {
              const mag = (1.0 + Math.random() * 1.0) * decay * reduceMult;
              const ang = Math.random() * Math.PI * 2;
              setCssVibration({ x: Math.cos(ang) * mag, y: Math.sin(ang) * mag });
            } else {
              setCssVibration({ x: 0, y: 0 });
            }
          }

          // Tightening vignette (peaks then eases out)
          const vig = Math.min(0.85, Math.sin(Math.min(1, progress * 1.5) * Math.PI * 0.5) * decay * 0.9);
          setHeavyAtmosphereVignette(vig);

          // 40 percent desaturation
          setHeavyAtmosphereDesat(decay * 0.40);

          // Short chromatic aberration pulse (first 0.8s)
          const pulse = Math.max(0, 1.0 - (sceneTime / 0.8)) * reduceMult;
          setChromaPulse(pulse);

          // Slow push-in
          beerRequestPushInRef.current = Math.min(0.65, (sceneTime / duration) * 0.65);

          // Existing lights dipping to 55 percent and recovering (lerp only)
          const targetFactor = sceneTime < 1.2 ? 0.55 : 1.0;
          const lerpSpeed = sceneTime < 1.2 ? delta * 3.2 : delta * 1.2;

          if (globalAmbientLightRef.current) {
            globalAmbientLightRef.current.intensity = THREE.MathUtils.lerp(
              globalAmbientLightRef.current.intensity,
              0.85 * targetFactor,
              lerpSpeed
            );
          }
          if (globalHemiLightRef.current) {
            globalHemiLightRef.current.intensity = THREE.MathUtils.lerp(
              globalHemiLightRef.current.intensity,
              0.50 * targetFactor,
              lerpSpeed
            );
          }
          if (globalDirLightRef.current) {
            globalDirLightRef.current.intensity = THREE.MathUtils.lerp(
              globalDirLightRef.current.intensity,
              1.8 * targetFactor,
              lerpSpeed
            );
          }

          if (sceneTime >= duration) {
            beerRequestPhaseRef.current = 'dad_now';
            beerRequestTimerRef.current = 0;
            cameraShakeIntensityRef.current = 0;
            setCssVibration({ x: 0, y: 0 });
            setHeavyAtmosphereVignette(0);
            setHeavyAtmosphereDesat(0);
            setChromaPulse(0);

            soundEngine.fadeHeavyAtmosphere(3.0);

            if (dadCharacterRef.current) {
              dadCharacterRef.current.group.rotation.y = DadCharacter.LIVING_ROOM_SOFA_ROT_Y;
              dadCharacterRef.current.sitIdle();
            }

            onSubtitleChangeRef.current?.(speaker, '“...Now.”');
            soundEngine.speakLine('...Now.', 'dad');
          }
        } else if (phase === 'dad_now') {
          // Lights recover smoothly to baseline
          if (globalAmbientLightRef.current && worldModeRef.current !== 'imagination') {
            globalAmbientLightRef.current.intensity = THREE.MathUtils.lerp(
              globalAmbientLightRef.current.intensity,
              0.85,
              delta * 2.0
            );
          }
          if (globalHemiLightRef.current) {
            globalHemiLightRef.current.intensity = THREE.MathUtils.lerp(
              globalHemiLightRef.current.intensity,
              0.50,
              delta * 2.0
            );
          }
          if (globalDirLightRef.current) {
            globalDirLightRef.current.intensity = THREE.MathUtils.lerp(
              globalDirLightRef.current.intensity,
              1.8,
              delta * 2.0
            );
          }

          if (sceneTime >= 1.8) {
            beerRequestPhaseRef.current = 'idle';
            isBeerRequestActiveRef.current = false;
            setIsBeerRequestActive(false);
            onSubtitleChangeRef.current?.('', '');

            // Control returns and kitchen_beer becomes active
            storyStateRef.current.quests.kitchen_beer = 'active';
            onStoryStateChangeRef.current?.(storyStateRef.current);
            onTelltaleNotificationRef.current?.('Kitchen: Bring Dad a beer from the fridge');
            soundEngine.playTelltaleBell();
          }
        }
      }

      // Check Cinematic Cutscene State
      if (cinematic.state !== 'gameplay') {
        cinematic.update(
          delta,
          camera,
          playerPos.current,
          battlefieldSceneRef.current,
          characterRef.current,
          (progress, isRolling, cinematicTime) => {
            character.updateCinematicAction(delta, cinematicTime, isRolling, progress);
          }
        );
        // Hide all floating labels during cutscenes
        Object.values(labelItemRefs.current).forEach((el) => {
          if (el && el.style.display !== 'none') el.style.display = 'none';
        });
      } else {
        // --- GAMEPLAY CONTROL MODE ---
        let isMoving = false;
        const isRealWorld = !battlefield.group.visible;
        const charScale = 0.7;
        character.setModelScale(charScale);

        const isSprinting = Boolean(keysPressed.current['ShiftLeft'] || keysPressed.current['ShiftRight']);
        // Real-world walk: 1.8 units/s (45% of 4.0), sprint: 2.8 units/s (70% of 4.0)
        let baseSpeed = isRealWorld
          ? (isSprinting ? 2.8 : 1.8)
          : (isSprinting ? 4.8 : CharacterModel.AUTHORED_RUN_SPEED);

        // When Zane is hurt, movement speed is reduced by about 50 percent
        if (character.isHurt) {
          baseSpeed *= 0.5;
        }

        const currentMoveSpeed = baseSpeed * speedMultiplierRef.current;
        const moveStep = currentMoveSpeed * delta;

        // FPS tracking for Developer Diagnostics
        fpsSamplesRef.current.frames++;
        fpsSamplesRef.current.time += delta;
        if (fpsSamplesRef.current.time >= 0.5) {
          setFpsVal(Math.round(fpsSamplesRef.current.frames / fpsSamplesRef.current.time));
          setFrameTimeVal(delta * 1000);
          fpsSamplesRef.current.frames = 0;
          fpsSamplesRef.current.time = 0;
        }

        // Determine current room silently based on player 3D position
        // Basement/stairwell dimming must ONLY run when worldMode is 'real' and within real house bounds
        const inBasementOrStairs =
          worldModeRef.current === 'real' &&
          playerPos.current.x < 100 &&
          (
            playerPos.current.y <= -0.15 ||
            (playerPos.current.x >= 1.82 && playerPos.current.x <= 5.8 && playerPos.current.z >= 9.8 && playerPos.current.z <= 12.2) ||
            (playerPos.current.x >= 5.8 && playerPos.current.x <= 20.0 && playerPos.current.z >= 6.0 && playerPos.current.z <= 16.0)
          );

        let currentRoom = 'bedroom';
        if (battlefield.group.visible) {
          currentRoom = 'battlefield';
        } else if (inBasementOrStairs) {
          currentRoom = 'basement';
        } else if (playerPos.current.z < 4.5) {
          currentRoom = 'bedroom';
        } else if (playerPos.current.x < -1.8 && playerPos.current.z >= 5.0 && playerPos.current.z <= 10.0) {
          currentRoom = 'workshop';
        } else if (playerPos.current.z > 19.5) {
          currentRoom = 'restroom';
        } else if (playerPos.current.x > 1.8 && playerPos.current.z >= 13.5 && playerPos.current.z <= 19.5 && playerPos.current.y >= -0.2) {
          currentRoom = 'living_room';
        } else if (playerPos.current.x < -1.8 && playerPos.current.z >= 13.5 && playerPos.current.z <= 19.5) {
          currentRoom = 'kitchen';
        } else {
          currentRoom = 'hallway';
        }

        // Opening: after the bedroom is playable, a subtitle from Dad (off-screen, calling from downstairs)
        if (!storyStateRef.current.openingPlayed && currentRoom === 'bedroom') {
          storyStateRef.current.openingPlayed = true;
          onStoryStateChangeRef.current?.(storyStateRef.current);
          onSubtitleChangeRef.current?.(
            'Dad (Downstairs)',
            '“Zane! I need my wrench from the basement. Now, please.”'
          );
          soundEngine.speakLine(
            'Zane! I need my wrench from the basement. Now, please.',
            'dad'
          );
          soundEngine.playRadioStatic();
        }

        // Invisible trigger zones evaluation (each zone fires once, invisible in normal play)
        if (triggerZonesRef.current && currentRoom !== 'battlefield') {
          const px = playerPos.current.x;
          const py = playerPos.current.y;
          const pz = playerPos.current.z;
          for (let i = 0; i < triggerZonesRef.current.length; i++) {
            const zone = triggerZonesRef.current[i];
            if (zone.helper) {
              zone.helper.visible = showDebugRef.current;
            }
            if (storyStateRef.current.triggeredZones[zone.id]) {
              continue;
            }
            if (
              px >= zone.minX &&
              px <= zone.maxX &&
              pz >= zone.minZ &&
              pz <= zone.maxZ &&
              py >= zone.minY &&
              py <= zone.maxY
            ) {
              storyStateRef.current.triggeredZones[zone.id] = true;
              zone.onEnter();
            }
          }
        }

        // 0. BEER FALL CINEMATIC CUTSCENE
        if (isBeerCutsceneActiveRef.current) {
          updateBeerCutscene(delta);
        }
        // 1. INSPECT CAMERA MODES with slow cinematic push-in
        else if (inspectMode.current === 'drawings') {
          dialogueDolly.current += delta * 0.04;
          const pushInZ = Math.min(dialogueDolly.current, 0.4);
          const inspectCamPos = new THREE.Vector3(-3.1 + pushInZ * 0.5, 2.1, -1.8);
          camera.position.lerp(inspectCamPos, delta * 4);
          camera.lookAt(-4.38, 2.1, -1.8);
          character.update(delta, false, false, 0);
        } else if (inspectMode.current === 'window') {
          dialogueDolly.current += delta * 0.04;
          const pushInZ = Math.min(dialogueDolly.current, 0.45);
          const inspectCamPos = new THREE.Vector3(0, 2.2, -2.6 - pushInZ);
          camera.position.lerp(inspectCamPos, delta * 3.5);
          camera.lookAt(0, 2.2, -12);
          character.update(delta, false, false, 0);
        } else if (inspectMode.current === 'holo_tv') {
          dialogueDolly.current += delta * 0.04;
          const pushInX = Math.min(dialogueDolly.current, 0.4);
          const inspectCamPos = new THREE.Vector3(2.4 - pushInX * 0.4, 1.8, 8.5);
          camera.position.lerp(inspectCamPos, delta * 4);
          camera.lookAt(0, 1.5, 8.5);
          character.update(delta, false, false, 0);
        }
        // 2. OVER-THE-SHOULDER CONVERSATION CAMERA (When Dialogue is Active)
        else if (isDialogueActiveRef.current && !isMoving) {
          dialogueDolly.current += delta * 0.045;
          const pushInDist = Math.min(dialogueDolly.current, 0.35);

          const charForward = new THREE.Vector3(
            Math.sin(playerRotation.current),
            0,
            Math.cos(playerRotation.current)
          ).normalize();
          const charRight = new THREE.Vector3(
            -Math.cos(playerRotation.current),
            0,
            Math.sin(playerRotation.current)
          ).normalize();

          const otsPos = playerPos.current.clone()
            .addScaledVector(charForward, -0.92 * charScale)
            .addScaledVector(charRight, 0.42 * charScale)
            .add(new THREE.Vector3(0, 1.28 * charScale, 0))
            .addScaledVector(charForward, pushInDist);

          const safeOtsPos = clampCameraToContinuousWorld(
            otsPos,
            currentRoom,
            playerPos.current,
            bedroomDoorRef.current,
            workshopDoorRef.current,
            basementDoorRef.current,
            restroomDoorRef.current
          );
          camera.position.lerp(safeOtsPos, delta * 6);

          const otsLookTarget = playerPos.current.clone()
            .addScaledVector(charForward, 3.0 * charScale)
            .add(new THREE.Vector3(0, 1.15 * charScale, 0));
          camera.lookAt(otsLookTarget);

          character.update(delta, false, false, 0, true, 0, charScale);
        }
        // 3. THIRD-PERSON FOLLOW & MOUSE LOOK CAMERA
        else {
          dialogueDolly.current = THREE.MathUtils.lerp(dialogueDolly.current, 0, delta * 3);

          const forward = new THREE.Vector3();
          camera.getWorldDirection(forward);
          forward.y = 0;
          if (forward.lengthSq() > 0.0001) {
            forward.normalize();
          } else {
            forward.set(0, 0, 1);
          }
          const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

          const isDepotActive = worldModeRef.current === 'imagination' || currentRoom === 'battlefield' || Boolean(battlefieldSceneRef.current?.supplyDepotGroup.visible);
          const canMove = !isPuzzleOpenRef.current && !isWrenchHandoffRef.current;
          const wPressed = (keysPressed.current['KeyW'] || (!isDepotActive && keysPressed.current['ArrowUp'])) && canMove ? 1 : 0;
          const sPressed = (keysPressed.current['KeyS'] || (!isDepotActive && keysPressed.current['ArrowDown'])) && canMove ? 1 : 0;
          const aPressed = (keysPressed.current['KeyA'] || (!isDepotActive && keysPressed.current['ArrowLeft'])) && canMove ? 1 : 0;
          const dPressed = (keysPressed.current['KeyD'] || (!isDepotActive && keysPressed.current['ArrowRight'])) && canMove ? 1 : 0;

          const forwardInput = wPressed - sPressed;
          const rightInput = dPressed - aPressed;

          const moveDir = new THREE.Vector3()
            .addScaledVector(forward, forwardInput)
            .addScaledVector(right, rightInput);

          if (moveDir.length() > 1) {
            moveDir.normalize();
          }

          const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
          camRight.y = 0;
          camRight.normalize();
          const isRightInverted = right.dot(camRight) < 0;

          forwardVecRef.current.copy(forward);
          rightVecRef.current.copy(right);
          isRightInvertedRef.current = isRightInverted;
          heldKeysRef.current = Object.keys(keysPressed.current).filter(k => keysPressed.current[k]);

          if (isWrenchHandoffRef.current) {
            wrenchHandoffTimerRef.current += delta;
            const wt = wrenchHandoffTimerRef.current;
            if (wt <= 0.6) {
              const stepProg = Math.min(1.0, wt / 0.6);
              playerPos.current.lerpVectors(
                wrenchHandoffStartPosRef.current,
                wrenchHandoffTargetPosRef.current,
                stepProg
              );
            }
          }

          // Update door pivot animations
          if (bedroomDoorRef.current) bedroomDoorRef.current.update(delta);
          if (workshopDoorRef.current) workshopDoorRef.current.update(delta);
          if (basementDoorRef.current) basementDoorRef.current.update(delta);
          if (restroomDoorRef.current) restroomDoorRef.current.update(delta);

          // Determine current room silently based on player 3D position
          if (battlefield.group.visible) {
            currentRoom = 'battlefield';
          } else if (inBasementOrStairs) {
            currentRoom = 'basement';
          } else if (playerPos.current.z < 4.5) {
            currentRoom = 'bedroom';
          } else if (playerPos.current.x < -1.8 && playerPos.current.z >= 4.5 && playerPos.current.z <= 11.0) {
            currentRoom = 'workshop';
          } else if (playerPos.current.z > 19.5) {
            currentRoom = 'restroom';
          } else if (playerPos.current.x > 1.8 && playerPos.current.z >= 13.5 && playerPos.current.z <= 19.5 && playerPos.current.y >= -0.2) {
            currentRoom = 'living_room';
          } else if (playerPos.current.x < -1.8 && playerPos.current.z >= 13.5 && playerPos.current.z <= 19.5) {
            currentRoom = 'kitchen';
          } else {
            currentRoom = 'hallway';
          }
          currentRoomRef.current = currentRoom;

          if (globalDirLightRef.current) {
            const dirLight = globalDirLightRef.current;
            // Texel snapping: round position to nearest shadow texel to avoid movement shimmering
            const shadowWorldSize = 14.0; // 14x14 frustum box
            const mapSize = dirLight.shadow.mapSize.width || 2048;
            const texelSize = shadowWorldSize / mapSize;
            const snappedX = Math.round(playerPos.current.x / texelSize) * texelSize;
            const snappedZ = Math.round(playerPos.current.z / texelSize) * texelSize;

            dirLight.position.set(snappedX + 8.0, 12.0, snappedZ + 6.0);
            dirLight.target.position.set(snappedX, 0.8, snappedZ);
            dirLight.target.updateMatrixWorld();
          }

          // Cool neon light & battlefield mood by lerping the existing lights, background and fog only
          const targetNeon = isHallwayImaginationRef.current ? 1.0 : 0.0;
          hallwayNeonTransitionRef.current = THREE.MathUtils.lerp(
            hallwayNeonTransitionRef.current,
            targetNeon,
            Math.min(1.0, delta * 3.5)
          );
          const neonT = hallwayNeonTransitionRef.current;

          if (globalAmbientLightRef.current) {
            globalAmbientLightRef.current.color.lerpColors(realAmbientColor, neonAmbientColor, neonT);
            globalAmbientLightRef.current.intensity = 0.85 + neonT * 0.25;
          }
          if (globalHemiLightRef.current) {
            globalHemiLightRef.current.color.lerpColors(realHemiSkyColor, neonHemiSkyColor, neonT);
            globalHemiLightRef.current.groundColor.lerpColors(realHemiGroundColor, neonHemiGroundColor, neonT);
          }
          if (globalDirLightRef.current) {
            globalDirLightRef.current.color.lerpColors(realDirColor, neonDirColor, neonT);
            globalDirLightRef.current.intensity = 1.8 + neonT * 0.4;
          }
          if (houseSceneRef.current) {
            houseSceneRef.current.setLightProgress(neonT);
          }
          if (bedroomDoorRef.current) bedroomDoorRef.current.setCyberProgress(neonT);
          if (workshopDoorRef.current) workshopDoorRef.current.setCyberProgress(neonT);
          if (basementDoorRef.current) basementDoorRef.current.setCyberProgress(neonT);
          if (restroomDoorRef.current) restroomDoorRef.current.setCyberProgress(neonT);

          // Basement Lighting, Power Restore & Ceiling Light Flicker Update (ONLY in real world)
          const hasBasementPower = Boolean(storyStateRef.current.hasPower);
          const isRealBasementDarkness = worldModeRef.current === 'real' && inBasementOrStairs;

          // Dimly but readably: ambient at about 35 percent with a cold blue tint. When power restored, lerp up to brighter value.
          const targetAmbientIntensity = isRealBasementDarkness
            ? (hasBasementPower ? 0.80 : 0.35)
            : 0.85;
          const targetHemiIntensity = isRealBasementDarkness
            ? (hasBasementPower ? 0.45 : 0.22)
            : 0.50;

          const targetAmbientColor = isRealBasementDarkness
            ? (hasBasementPower ? new THREE.Color(0xfef3c7) : new THREE.Color(0x7593b4))
            : new THREE.Color(0xffedd5);
          const targetHemiSkyColor = isRealBasementDarkness
            ? (hasBasementPower ? new THREE.Color(0xfef3c7) : new THREE.Color(0x6585a7))
            : new THREE.Color(0xfff1db);

          // Power Flicker calculation (lerp existing ceiling light intensities up, never adding/removing lights)
          let flickerMult = 1.0;
          if (isPowerFlickeringRef.current) {
            powerFlickerTimerRef.current += delta;
            const ft = powerFlickerTimerRef.current;
            if (ft < 1.3) {
              flickerMult = Math.sin(ft * 38) > 0.05 ? 0.85 + Math.random() * 0.35 : 0.12;
            } else if (ft < 1.9) {
              flickerMult = THREE.MathUtils.lerp(0.5, 1.0, (ft - 1.3) / 0.6);
            } else {
              isPowerFlickeringRef.current = false;
              flickerMult = 1.0;
            }
          }

          if (hasBasementPower) {
            basementPowerLerpRef.current = THREE.MathUtils.lerp(
              basementPowerLerpRef.current,
              1.0,
              Math.min(1.0, delta * 2.8)
            );
          } else {
            basementPowerLerpRef.current = 0.0;
          }

          if (basementSceneRef.current) {
            basementSceneRef.current.setCeilingLights(basementPowerLerpRef.current, flickerMult);
          }

          if (globalAmbientLightRef.current && !isHallwayImaginationRef.current) {
            globalAmbientLightRef.current.intensity = THREE.MathUtils.lerp(
              globalAmbientLightRef.current.intensity,
              targetAmbientIntensity,
              Math.min(1.0, delta * 2.5)
            );
            globalAmbientLightRef.current.color.lerp(targetAmbientColor, Math.min(1.0, delta * 2.5));
          }
          if (globalHemiLightRef.current && !isHallwayImaginationRef.current) {
            globalHemiLightRef.current.intensity = THREE.MathUtils.lerp(
              globalHemiLightRef.current.intensity,
              targetHemiIntensity,
              Math.min(1.0, delta * 2.5)
            );
            globalHemiLightRef.current.color.lerp(targetHemiSkyColor, Math.min(1.0, delta * 2.5));
          }

          if (sceneRef.current && !battlefield.group.visible) {
            if (inBasementOrStairs) {
              const bgCol = hasBasementPower ? 0x162032 : 0x0a101d;
              sceneRef.current.background = new THREE.Color(bgCol);
              sceneRef.current.fog = new THREE.FogExp2(bgCol, hasBasementPower ? 0.01 : 0.018);
              if (rendererRef.current) rendererRef.current.setClearColor(bgCol, 1.0);
            } else if (!isHallwayImaginationRef.current) {
              sceneRef.current.background = new THREE.Color(0xded0bb);
              sceneRef.current.fog = null;
              if (rendererRef.current) rendererRef.current.setClearColor(0xded0bb, 1.0);
            } else {
              const realBg = new THREE.Color(0xded0bb);
              const battleNavyBg = new THREE.Color(0x09111e);
              sceneRef.current.background = new THREE.Color().lerpColors(realBg, battleNavyBg, neonT);
              if (neonT > 0.05) {
                sceneRef.current.fog = new THREE.FogExp2(0x09111e, 0.035 * neonT);
              } else {
                sceneRef.current.fog = null;
              }
            }
          }

          // =========================================================================
          // SUPPLY DEPOT LIGHTING: FINAL LIGHTING UPDATE EACH FRAME
          // Runs AFTER any basement, stairwell, region, flashlight, or real-world lighting.
          // Directly sets depot lighting so nothing else can darken it.
          // =========================================================================
          const isDepotActiveFrame = Boolean(
            battlefield.group.visible ||
            worldModeRef.current === 'imagination' ||
            battlefieldSceneRef.current?.supplyDepotGroup.visible
          );

          // Lazy-create any missing depot lights once and keep for session
          if (!depotAmbientLightRef.current) {
            const amb = new THREE.AmbientLight(0x4a6a9a, 0.9);
            amb.name = 'DepotAmbientLight';
            scene.add(amb);
            depotAmbientLightRef.current = amb;
          }
          if (!depotHemiLightRef.current) {
            const hemi = new THREE.HemisphereLight(0x6f8fcf, 0x1a2238, 0.8);
            hemi.name = 'DepotHemisphereLight';
            scene.add(hemi);
            depotHemiLightRef.current = hemi;
          }
          if (!depotDirLightRef.current) {
            const dir = new THREE.DirectionalLight(0x9fd8ff, 1.6);
            dir.name = 'DepotDirectionalLight';
            dir.castShadow = false;
            scene.add(dir);
            scene.add(dir.target);
            depotDirLightRef.current = dir;
          }
          if (!depotCounterLightRef.current) {
            const counter = new THREE.DirectionalLight(0xf97316, 0.7);
            counter.name = 'DepotOrangeCounterLight';
            scene.add(counter);
            scene.add(counter.target);
            depotCounterLightRef.current = counter;
          }

          if (isDepotActiveFrame) {
            // 1. Directly set ambient light intensity 0.9 with color 0x4a6a9a (+2.5 if fullbright)
            depotAmbientLightRef.current.visible = true;
            depotAmbientLightRef.current.color.setHex(0x4a6a9a);
            depotAmbientLightRef.current.intensity = isFullbrightRef.current ? 0.9 + 2.5 : 0.9;

            // 2. Directly set hemisphere light intensity 0.8 (sky 0x6f8fcf, ground 0x1a2238)
            depotHemiLightRef.current.visible = true;
            depotHemiLightRef.current.color.setHex(0x6f8fcf);
            depotHemiLightRef.current.groundColor.setHex(0x1a2238);
            depotHemiLightRef.current.intensity = 0.8;

            // 3. Directly set directional light intensity 1.6 with color 0x9fd8ff positioned above and behind Zane, following him
            depotDirLightRef.current.visible = true;
            depotDirLightRef.current.color.setHex(0x9fd8ff);
            depotDirLightRef.current.intensity = 1.6;
            depotDirLightRef.current.position.set(
              playerPos.current.x,
              playerPos.current.y + 6.0,
              playerPos.current.z - 6.0
            );
            depotDirLightRef.current.target.position.copy(playerPos.current);
            depotDirLightRef.current.target.updateMatrixWorld();

            // 4. Directly set orange counter-light intensity 0.7
            depotCounterLightRef.current.visible = true;
            depotCounterLightRef.current.color.setHex(0xf97316);
            depotCounterLightRef.current.intensity = 0.7;
            depotCounterLightRef.current.position.set(
              playerPos.current.x + 3.0,
              playerPos.current.y + 3.5,
              playerPos.current.z + 5.0
            );
            depotCounterLightRef.current.target.position.copy(playerPos.current);
            depotCounterLightRef.current.target.updateMatrixWorld();

            // 5. Directly set scene.background to 0x0b1830 and fog to FogExp2 0x0b1830 with density 0.012 (or null if fullbright)
            if (sceneRef.current) {
              sceneRef.current.background = new THREE.Color(0x0b1830);
              if (isFullbrightRef.current) {
                sceneRef.current.fog = null;
              } else {
                sceneRef.current.fog = new THREE.FogExp2(0x0b1830, 0.012);
              }
            }

            // 6. Directly set renderer.toneMappingExposure to 1.3 in the depot
            if (rendererRef.current) {
              rendererRef.current.toneMappingExposure = 1.3;
              rendererRef.current.setClearColor(0x0b1830, 1.0);
            }
          } else {
            // Real world mode: depot lights turned off
            if (depotAmbientLightRef.current) depotAmbientLightRef.current.intensity = 0;
            if (depotHemiLightRef.current) depotHemiLightRef.current.intensity = 0;
            if (depotDirLightRef.current) depotDirLightRef.current.intensity = 0;
            if (depotCounterLightRef.current) depotCounterLightRef.current.intensity = 0;
            if (rendererRef.current) {
              rendererRef.current.toneMappingExposure = 0.8;
            }
            if (isFullbrightRef.current) {
              if (globalAmbientLightRef.current) {
                globalAmbientLightRef.current.intensity = 0.85 + 2.5;
              }
              if (sceneRef.current) {
                sceneRef.current.fog = null;
              }
            }
          }

          // Real room visibility management (only active in 'real' world mode)
          if (worldModeRef.current === 'real') {
            const pPos = playerPos.current;
            const bd = bedroomDoorRef.current;
            const wd = workshopDoorRef.current;
            const rd = restroomDoorRef.current;
            const bsd = basementDoorRef.current;

            if (inBasementOrStairs) {
              // Player in basement or stairwell:
              // 1. Set visible = false on every real-world room group above
              bedroom.group.visible = false;
              houseMap.group.visible = false;
              if (workshopSceneRef.current) workshopSceneRef.current.group.visible = false;
              if (restroomSceneRef.current) restroomSceneRef.current.group.visible = false;

              // 2. Hide doors and props of the rooms above
              if (bd) { bd.pivotGroup.visible = false; bd.frameGroup.visible = false; }
              if (wd) { wd.pivotGroup.visible = false; wd.frameGroup.visible = false; }
              if (rd) { rd.pivotGroup.visible = false; rd.frameGroup.visible = false; }

              // Keep basement door frame/pivot visible at the top stairwell mouth
              if (bsd) { bsd.pivotGroup.visible = true; bsd.frameGroup.visible = true; }

              // 3. Hide Dad
              if (dadCharacterRef.current) {
                dadCharacterRef.current.group.visible = false;
              }

              // 4. Basement is visible
              if (basementSceneRef.current) {
                basementSceneRef.current.group.visible = true;
              }
            } else {
              // Player is back upstairs: restore upstairs doors
              if (bd) { bd.pivotGroup.visible = true; bd.frameGroup.visible = true; }
              if (wd) { wd.pivotGroup.visible = true; wd.frameGroup.visible = true; }
              if (rd) { rd.pivotGroup.visible = true; rd.frameGroup.visible = true; }
              if (bsd) { bsd.pivotGroup.visible = true; bsd.frameGroup.visible = true; }

              const isBdActive = Boolean(bd && (bd.isOpen || bd.animProgress > 0) && pPos.distanceTo(bd.position) < 6.0);
              const isWdActive = Boolean(wd && (wd.isOpen || wd.animProgress > 0) && pPos.distanceTo(wd.position) < 6.0);
              const isRdActive = Boolean(rd && (rd.isOpen || rd.animProgress > 0) && pPos.distanceTo(rd.position) < 6.0);
              const isBsdActive = Boolean(bsd && (bsd.isOpen || bsd.animProgress > 0) && pPos.distanceTo(bsd.position) < 6.0);

              bedroom.group.visible = currentRoom === 'bedroom' || isBdActive;
              houseMap.group.visible = (
                currentRoom === 'hallway' ||
                currentRoom === 'living_room' ||
                currentRoom === 'kitchen' ||
                isBdActive ||
                isWdActive ||
                isBsdActive ||
                isRdActive
              );
              if (workshopSceneRef.current) {
                workshopSceneRef.current.group.visible = currentRoom === 'workshop' || isWdActive;
              }
              if (restroomSceneRef.current) {
                restroomSceneRef.current.group.visible = currentRoom === 'restroom' || isRdActive;
              }

              // Basement only renders if door is open and player is near it
              if (basementSceneRef.current) {
                basementSceneRef.current.group.visible = isBsdActive;
              }

              // Dad visibility rule:
              // "Dad must only be visible if he is in the same region as the player, or seen through an open doorway within 6 units."
              if (dadCharacterRef.current) {
                const dad = dadCharacterRef.current;
                const dadPos = dad.group.position;
                const distToDad = pPos.distanceTo(dadPos);

                let dadRegion = 'living_room';
                if (dadPos.x > 1.8 && dadPos.z >= 13.5 && dadPos.z <= 19.5 && dadPos.y >= -0.1) {
                  dadRegion = 'living_room';
                } else if (dadPos.x < -1.8 && dadPos.z >= 13.5 && dadPos.z <= 19.5) {
                  dadRegion = 'kitchen';
                } else if (dadPos.x < -1.8 && dadPos.z >= 4.5 && dadPos.z <= 11.0) {
                  dadRegion = 'workshop';
                } else if (dadPos.y < -0.2) {
                  dadRegion = 'basement';
                } else {
                  dadRegion = 'hallway';
                }

                if (currentRoom === dadRegion) {
                  dad.group.visible = true;
                } else if (distToDad <= 6.0) {
                  if (dadRegion === 'living_room' && (currentRoom === 'hallway' || currentRoom === 'kitchen')) {
                    dad.group.visible = true;
                  } else if (dadRegion === 'kitchen' && (currentRoom === 'hallway' || currentRoom === 'living_room')) {
                    dad.group.visible = true;
                  } else if (dadRegion === 'workshop' && (wd?.isOpen || (wd?.animProgress || 0) > 0)) {
                    dad.group.visible = true;
                  } else if (dadRegion === 'bedroom' && (bd?.isOpen || (bd?.animProgress || 0) > 0)) {
                    dad.group.visible = true;
                  } else if (dadRegion === 'restroom' && (rd?.isOpen || (rd?.animProgress || 0) > 0)) {
                    dad.group.visible = true;
                  } else if (dadRegion === 'basement' && (bsd?.isOpen || (bsd?.animProgress || 0) > 0)) {
                    dad.group.visible = true;
                  } else {
                    dad.group.visible = false;
                  }
                } else {
                  dad.group.visible = false;
                }
              }
            }

            // TRIGGER ZONE in front of fridge when kitchen_beer is active
            if (
              storyStateRef.current.quests.kitchen_beer === 'active' &&
              !isTransitioningRef.current
            ) {
              // Refrigerator front zone: x in [-8.0, -6.6], z in [15.2, 16.5]
              if (pPos.x >= -8.0 && pPos.x <= -6.6 && pPos.z >= 15.2 && pPos.z <= 16.5) {
                isTransitioningRef.current = true;
                soundEngine.playWhoosh();
                triggerImaginationWipe(true, () => {
                  setWorldMode('imagination', 'kitchen_beer_fridge', { spawn: new THREE.Vector3(500, 0, -12) });
                  onSubtitleChangeRef.current?.('Zane', '“I need to get that without him noticing.”');
                  soundEngine.speakLine('I need to get that without him noticing.', 'zane');
                });
              }
            }
          }

          // Supply Depot Stealth & Movement / Chase Update Loop (in 'imagination' world mode)
          if (worldModeRef.current === 'imagination' && battlefieldSceneRef.current) {
            if (isZaneHurtRef.current || isZaneHurt) {
              // --- INJURED CHASE & ENDING SEQUENCE ---
              if (isChaseFrozenRef.current) {
                if (!isHardCutBlackRef.current) {
                  catchTimerRef.current += delta;
                  if (battlefieldSceneRef.current.monsterDadGroup) {
                    battlefieldSceneRef.current.monsterDadGroup.lookAt(playerPos.current.x, 0.8, playerPos.current.z);
                  }
                  if (catchTimerRef.current >= 2.5) {
                    isHardCutBlackRef.current = true;
                    setIsHardCutBlack(true);
                    soundEngine.stopAllAudio();
                    onSubtitleChangeRef.current?.('', '');
                  }
                } else if (!showEndCard) {
                  blackHoldTimerRef.current += delta;
                  if (blackHoldTimerRef.current >= 4.0) {
                    setShowEndCard(true);
                  }
                }
              } else {
                chaseTimerRef.current += delta;

                // 10-Second Stumble Moment
                if (chaseTimerRef.current >= 10.0 && !hasStumbledRef.current) {
                  hasStumbledRef.current = true;
                  stumbleTimerRef.current = 1.0;
                  soundEngine.playImpact();
                }
                if (stumbleTimerRef.current > 0) {
                  stumbleTimerRef.current -= delta;
                }

                // Heavy Breathing & Heartbeat Audio
                soundEngine.playHeavyBreathing();

                const monsterDad = battlefieldSceneRef.current.monsterDadGroup;
                if (monsterDad) {
                  const monsterPos = monsterDad.position;
                  const distToMonster = monsterPos.distanceTo(playerPos.current);

                  // Heartbeat accelerates as monster gets closer
                  heartbeatTimerRef.current += delta;
                  const hbInterval = Math.max(0.25, distToMonster * 0.08);
                  if (heartbeatTimerRef.current >= hbInterval) {
                    heartbeatTimerRef.current = 0;
                    soundEngine.playHeartbeatThump();
                  }

                  // Tightening Red Vignette
                  const vignOpacity = Math.min(0.9, 0.25 + (14.0 - Math.min(14.0, distToMonster)) / 14.0 * 0.65);
                  setChaseVignetteOpacity(vignOpacity);

                  // Monster Pursuit (slowed slightly near cover/debris)
                  let nearCover = false;
                  for (const box of battlefieldSceneRef.current.supplyDepotCoverBoxes) {
                    if (
                      monsterPos.x >= box.minX - 0.6 && monsterPos.x <= box.maxX + 0.6 &&
                      monsterPos.z >= box.minZ - 0.6 && monsterPos.z <= box.maxZ + 0.6
                    ) {
                      nearCover = true;
                      break;
                    }
                  }

                  const monsterSpeed = nearCover ? 1.6 : 2.5;
                  const monsterDir = new THREE.Vector3().subVectors(playerPos.current, monsterPos);
                  monsterDir.y = 0;
                  if (monsterDir.lengthSq() > 0.001) {
                    monsterDir.normalize();
                    monsterPos.addScaledVector(monsterDir, monsterSpeed * delta);
                    monsterDad.lookAt(playerPos.current.x, monsterPos.y, playerPos.current.z);
                  }

                  // Catch condition
                  if (distToMonster <= 1.2 || chaseTimerRef.current >= 22.0) {
                    isChaseFrozenRef.current = true;
                    soundEngine.playMonsterRoar();
                    soundEngine.speakMonsterLine('You will soon join your mother.');
                    onSubtitleChangeRef.current?.('Monster Dad', '“You will soon join your mother.”');
                  }
                }
              }
            } else {
              // --- STEALTH & DEPOT PUZZLE (BEFORE BOTTLE FALL) ---
              battlefieldSceneRef.current.updateSupplyDepot(delta, soundEngine);

              // Checkpoints along the depot path
              if (playerPos.current.z >= 4.0) {
                activeCheckpointRef.current.set(500, 0, 4.0);
              } else if (playerPos.current.z >= -3.0) {
                activeCheckpointRef.current.set(500, 0, -3.0);
              }

              const isCrouching = Boolean(
                keysPressed.current['ControlLeft'] ||
                keysPressed.current['ControlRight'] ||
                keysPressed.current['KeyC']
              );

              // Kinematic Jumping (Space)
              if (keysPressed.current['Space'] && isGroundedRef.current) {
                jumpVelocityYRef.current = 5.2;
                isGroundedRef.current = false;
              }

              jumpVelocityYRef.current -= 15.0 * delta;
              playerPos.current.y += jumpVelocityYRef.current * delta;

              const px = playerPos.current.x;
              const pz = playerPos.current.z;

              // Check 3 floor gaps
              const inGap1 = pz >= -6.5 && pz <= -5.5 && Math.abs(px - 500) < 3.5;
              const inGap2 = pz >= -0.5 && pz <= 0.5 && Math.abs(px - 500) < 3.5;
              const inGap3 = pz >= 5.5 && pz <= 6.5 && Math.abs(px - 500) < 3.5;
              const inGap = inGap1 || inGap2 || inGap3;

              const onPlatform = pz >= 8.8 && pz <= 12.6 && Math.abs(px - 500) < 2.5;
              const targetSurfaceHeight = inGap ? -10.0 : (onPlatform ? 0.8 : 0.0);

              if (playerPos.current.y <= targetSurfaceHeight) {
                if (targetSurfaceHeight < -2.0) {
                  // Fell into gap!
                  soundEngine.playImpact();
                  triggerRedVignettePulse();
                  playerPos.current.copy(activeCheckpointRef.current);
                  playerPos.current.y = 0;
                  jumpVelocityYRef.current = 0;
                  isGroundedRef.current = true;
                } else {
                  playerPos.current.y = targetSurfaceHeight;
                  jumpVelocityYRef.current = 0;
                  isGroundedRef.current = true;
                }
              }

              // Monster Dad Stealth Detection
              if (!isRespawningRef.current) {
                const detected = battlefieldSceneRef.current.checkMonsterDetection(playerPos.current, isCrouching);
                if (detected) {
                  isRespawningRef.current = true;
                  soundEngine.playAlertSting();
                  triggerRedVignettePulse();
                  playerPos.current.copy(activeCheckpointRef.current);
                  playerPos.current.y = 0;
                  setTimeout(() => {
                    isRespawningRef.current = false;
                  }, 500);
                }
              }
            }
          }

          // Silent unlock of basement door when key is collected
          if (storyStateRef.current.hasKey && basementDoorRef.current && basementDoorRef.current.isLocked) {
            basementDoorRef.current.setLocked(false);
            basementDoorRef.current.interactionNode.promptVerb = 'Open';
            basementDoorRef.current.interactionNode.name = 'Basement Door';
            basementDoorRef.current.interactionNode.description = 'Press E to open Basement Door.';
          }

          if (noclipRef.current) {
            // Noclip fly movement: Q descends, E ascends, WASD moves freely without collision
            const flySpeed = currentMoveSpeed * 1.5;
            const flyStep = flySpeed * delta;
            if (moveDir.lengthSq() > 0.001) {
              moveDir.normalize();
              moveDir.y = 0;
              isMoving = true;
              playerPos.current.addScaledVector(moveDir, flyStep);
              const targetRot = Math.atan2(moveDir.x, moveDir.z);
              playerRotation.current = targetRot;
            }
            if (keysPressed.current['KeyE']) {
              playerPos.current.y += flyStep;
              isMoving = true;
            }
            if (keysPressed.current['KeyQ']) {
              playerPos.current.y -= flyStep;
              isMoving = true;
            }
          } else {
            if (isBeerRequestActiveRef.current) {
              isMoving = false;
            } else if (moveDir.lengthSq() > 0.001) {
              moveDir.normalize();
              moveDir.y = 0;
              isMoving = true;

              const targetRot = Math.atan2(moveDir.x, moveDir.z);
              let diff = targetRot - playerRotation.current;
              while (diff < -Math.PI) diff += Math.PI * 2;
              while (diff > Math.PI) diff -= Math.PI * 2;
              playerRotation.current += diff * Math.min(delta / 0.1, 1.0);

              const isOnStairs = (playerPos.current.x >= 1.75 && playerPos.current.x <= 6.25 && playerPos.current.z >= 10.15 && playerPos.current.z <= 11.85);
              const effectiveMoveStep = isOnStairs ? moveStep * 0.75 : moveStep;
              const candidatePos = playerPos.current.clone().addScaledVector(moveDir, effectiveMoveStep);

              // Dynamic Active Colliders across continuous 3D world
              const isDepotActive = worldModeRef.current === 'imagination' || currentRoom === 'battlefield' || Boolean(battlefieldSceneRef.current?.group.visible);
              const activeColliders: BoxCollider2D[] = [];
              if (isDepotActive) {
                if (battlefieldSceneRef.current) {
                  const isAbovePlatform = playerPos.current.y >= 0.75;
                  for (const col of battlefieldSceneRef.current.supplyDepotColliders) {
                    if (col.id === 'depot_platform') {
                      if (!isAbovePlatform) {
                        activeColliders.push(col);
                      }
                    } else {
                      activeColliders.push(col);
                    }
                  }
                }
              } else {
                if (currentRoom === 'bedroom' || bedroomDoorRef.current?.isOpen || playerPos.current.z < 6.5) {
                  activeColliders.push(...bedroom.colliders);
                }
                if (
                  currentRoom === 'hallway' ||
                  currentRoom === 'living_room' ||
                  currentRoom === 'kitchen' ||
                  bedroomDoorRef.current?.isOpen ||
                  workshopDoorRef.current?.isOpen ||
                  basementDoorRef.current?.isOpen ||
                  restroomDoorRef.current?.isOpen
                ) {
                  activeColliders.push(...houseMap.colliders);
                }
                if (workshopSceneRef.current && (currentRoom === 'workshop' || workshopDoorRef.current?.isOpen)) {
                  activeColliders.push(...workshopSceneRef.current.colliders);
                }
                if (restroomSceneRef.current && (currentRoom === 'restroom' || restroomDoorRef.current?.isOpen)) {
                  activeColliders.push(...restroomSceneRef.current.colliders);
                }
                if (basementSceneRef.current && (currentRoom === 'basement' || basementDoorRef.current?.isOpen)) {
                  activeColliders.push(...basementSceneRef.current.colliders);
                }

                // Closed door solid colliders
                for (const door of [bedroomDoorRef.current, workshopDoorRef.current, basementDoorRef.current, restroomDoorRef.current]) {
                  if (door) {
                    const col = door.getCollider();
                    if (col) activeColliders.push(col);
                  }
                }

                // Dad standing solid collider
                const dadCol = dadCharacterRef.current?.getCollider();
                if (dadCol) {
                  activeColliders.push(dadCol);
                }
              }

              // Update Touching Collider (broad check for idle and movement)
              let currentTouching: string | null = null;
              const charColliderRadius = CHARACTER_COLLIDER_RADIUS * charScale;
              for (const box of activeColliders) {
                const closestX = THREE.MathUtils.clamp(playerPos.current.x, box.minX, box.maxX);
                const closestZ = THREE.MathUtils.clamp(playerPos.current.z, box.minZ, box.maxZ);
                const dx = playerPos.current.x - closestX;
                const dz = playerPos.current.z - closestZ;
                if (dx * dx + dz * dz <= (charColliderRadius + 0.05) * (charColliderRadius + 0.05)) {
                  currentTouching = box.name || box.id;
                  break;
                }
              }
              touchingColliderRef.current = currentTouching;

              // Render Debug Colliders Group if enabled
              if (showCollidersRef.current) {
                if (!debugCollidersGroupRef.current) {
                  const dbgGrp = new THREE.Group();
                  dbgGrp.name = 'DebugCollidersGroup';
                  scene.add(dbgGrp);
                  debugCollidersGroupRef.current = dbgGrp;
                }
                debugCollidersGroupRef.current.visible = true;
                debugCollidersFrameCount.current += 1;
                if (debugCollidersFrameCount.current % 15 === 1) {
                  const grp = debugCollidersGroupRef.current;
                  while (grp.children.length > 0) {
                    const child = grp.children[0];
                    grp.remove(child);
                    if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
                  }
                  const newVisual = createColliderDebugGroup(activeColliders, 0x06b6d4);
                  while (newVisual.children.length > 0) {
                    grp.add(newVisual.children[0]);
                  }
                }
              } else if (debugCollidersGroupRef.current) {
                debugCollidersGroupRef.current.visible = false;
              }

              const resolvedPos = resolveCharacterCollisions(candidatePos, activeColliders, charColliderRadius, touchingColliderRef);
              playerPos.current.copy(resolvedPos);
              lastSafePos.current.copy(playerPos.current);

              footstepTimer.current += delta;
              const animTimeScale = currentMoveSpeed / (charScale * CharacterModel.AUTHORED_RUN_SPEED);
              const stepInterval = 0.32 / Math.max(0.1, animTimeScale);
              if (footstepTimer.current > stepInterval) {
                footstepTimer.current = 0;
                soundEngine.playFootstep();
              }
            }

            if (worldModeRef.current === 'real') {
              const targetFloorY = getFloorY(playerPos.current.x, playerPos.current.z);
              playerPos.current.y = THREE.MathUtils.lerp(playerPos.current.y, targetFloorY, delta * 12);
            }
          }

          character.group.position.copy(playerPos.current);
          character.group.rotation.y = playerRotation.current;
          const isCrouching = Boolean(
            keysPressed.current['ControlLeft'] ||
            keysPressed.current['ControlRight'] ||
            keysPressed.current['KeyC']
          );
          character.update(delta, isMoving, false, 0, isDialogueActiveRef.current, currentMoveSpeed, charScale, isCrouching);

          const yaw = cameraYaw.current;
          const pitch = cameraPitch.current;
          const horizDist = (3.0 * charScale) * Math.cos(pitch);
          const heightOffset = (0.5 * charScale) - (2.5 * charScale) * Math.sin(pitch);

          const desiredCamPos = new THREE.Vector3(
            playerPos.current.x - Math.sin(yaw) * horizDist,
            playerPos.current.y + (1.2 * charScale) + heightOffset,
            playerPos.current.z - Math.cos(yaw) * horizDist
          );

          const clampedCamPos = clampCameraToContinuousWorld(
            desiredCamPos,
            currentRoom,
            playerPos.current,
            bedroomDoorRef.current,
            workshopDoorRef.current,
            basementDoorRef.current,
            restroomDoorRef.current
          );

          if (isBeerRequestActiveRef.current) {
            const isLivingRoom =
              currentRoomRef.current === 'living_room' ||
              playerPos.current.distanceTo(DadCharacter.LIVING_ROOM_SOFA_POS) < 7.5;

            if (isLivingRoom) {
              const dirToDad = new THREE.Vector3().subVectors(DadCharacter.LIVING_ROOM_SOFA_POS, playerPos.current);
              dirToDad.y = 0;
              dirToDad.normalize();

              playerRotation.current = Math.atan2(dirToDad.x, dirToDad.z);
              character.group.rotation.y = playerRotation.current;

              const right = new THREE.Vector3().crossVectors(dirToDad, new THREE.Vector3(0, 1, 0)).normalize();
              const shoulderCamPos = playerPos.current.clone()
                .sub(dirToDad.clone().multiplyScalar(1.5))
                .add(right.clone().multiplyScalar(0.40))
                .add(new THREE.Vector3(0, 1.45, 0));

              if (beerRequestPushInRef.current > 0) {
                shoulderCamPos.add(dirToDad.clone().multiplyScalar(beerRequestPushInRef.current));
              }

              camera.position.lerp(shoulderCamPos, Math.min(1.0, delta * 9.0));
              camera.lookAt(new THREE.Vector3(6.4, 1.25, 16.5));
            } else {
              const frontCamPos = playerPos.current.clone()
                .add(new THREE.Vector3(Math.sin(playerRotation.current + 0.4) * 2.2, 1.4, Math.cos(playerRotation.current + 0.4) * 2.2));
              if (beerRequestPushInRef.current > 0) {
                const pushDir = new THREE.Vector3().subVectors(playerPos.current, frontCamPos).normalize();
                frontCamPos.add(pushDir.multiplyScalar(beerRequestPushInRef.current * 0.5));
              }
              camera.position.lerp(frontCamPos, Math.min(1.0, delta * 9.0));
              camera.lookAt(new THREE.Vector3(playerPos.current.x, playerPos.current.y + 1.25, playerPos.current.z));
            }

            if (cameraShakeIntensityRef.current > 0.001) {
              const reduceMult = isReduceShakeEnabled() ? 0.3 : 1.0;
              const currentShake = cameraShakeIntensityRef.current * reduceMult;
              camera.position.x += (Math.random() - 0.5) * currentShake * 0.25;
              camera.position.y += (Math.random() - 0.5) * currentShake * 0.25;
              camera.position.z += (Math.random() - 0.5) * currentShake * 0.15;
              camera.rotation.z += (Math.random() - 0.5) * currentShake * 0.03;
            }
          } else {
            camera.position.lerp(clampedCamPos, Math.min(1.0, delta * 9.0));

            // Limp camera sway when Zane is hurt and moving
            if (character.isHurt && isMoving) {
              limpTimer.current += delta * 6;
              const limpRoll = Math.sin(limpTimer.current) * 0.025;
              const limpHop = Math.abs(Math.sin(limpTimer.current)) * 0.04;
              camera.position.y += limpHop;
              camera.rotation.z += limpRoll;
            }

            const targetLookPos = new THREE.Vector3(
              playerPos.current.x,
              playerPos.current.y + (1.2 * charScale) + (2.5 * charScale) * Math.sin(pitch),
              playerPos.current.z
            );
            currentLookTarget.current.lerp(targetLookPos, Math.min(1.0, delta * 12.0));
            camera.lookAt(currentLookTarget.current);
          }
        }

        // Crosshair Node Proximity Detection for Continuous 3D World
        const activeNodes: InteractionNode[] = [];
        if (worldModeRef.current === 'imagination') {
          activeNodes.push({
            id: 'supply_capsule',
            name: 'Beer Bottle',
            position: [500, 1.2, 11.2],
            promptKey: 'E',
            promptVerb: 'Take',
            interactRadius: 2.5,
            description: 'Chilled beer bottle on the raised platform.',
          });
        } else if (inBasementOrStairs) {
          // When in basement or stairwell: ONLY basement nodes and basement door
          if (basementSceneRef.current && basementSceneRef.current.group.visible) {
            activeNodes.push(...basementSceneRef.current.interactionNodes);
          }
          if (basementDoorRef.current) {
            activeNodes.push(basementDoorRef.current.interactionNode);
          }
        } else {
          if (bedroom.group.visible) {
            activeNodes.push(...bedroom.interactionNodes.filter((n) => n.id !== 'bedroom_door'));
          }
          if (houseMap.group.visible) {
            activeNodes.push(
              ...houseMap.interactionNodes.filter((n) => {
                if (n.id === 'house_workshop' || n.id === 'house_basement' || n.id === 'house_restroom' || n.id === 'house_return_bedroom') return false;
                if (n.id === 'kitchen_drawer' && storyStateRef.current.quests.kitchen_key !== 'active') return false;
                return true;
              })
            );
          }
          if (bedroomDoorRef.current && (bedroom.group.visible || houseMap.group.visible)) {
            activeNodes.push(bedroomDoorRef.current.interactionNode);
          }
          if (workshopDoorRef.current && (houseMap.group.visible || workshopSceneRef.current?.group.visible)) {
            activeNodes.push(workshopDoorRef.current.interactionNode);
          }
          if (workshopSceneRef.current && (houseMap.group.visible || workshopSceneRef.current.group.visible)) {
            activeNodes.push(...workshopSceneRef.current.interactionNodes);
          }
          if (storyStateRef.current.hasWrench && storyStateRef.current.quests.deliver_wrench !== 'completed') {
            const isDadReady = Boolean(dadCharacterRef.current && dadCharacterRef.current.isLoaded);
            const dadWrenchPos: [number, number, number] = isDadReady
              ? [dadCharacterRef.current!.group.position.x + 0.4, 1.45, dadCharacterRef.current!.group.position.z]
              : [-6.6, 1.25, 7.5];

            activeNodes.push({
              id: 'dad_give_wrench',
              name: 'Give wrench',
              position: dadWrenchPos,
              promptKey: 'E',
              promptVerb: 'Give wrench',
              description: 'Hand the mechanic wrench to Dad at the workbench.',
              interactRadius: 2.5,
            });
          }
          if (basementDoorRef.current && (houseMap.group.visible || basementSceneRef.current?.group.visible)) {
            activeNodes.push(basementDoorRef.current.interactionNode);
          }
          if (basementSceneRef.current && (houseMap.group.visible || basementSceneRef.current.group.visible)) {
            activeNodes.push(...basementSceneRef.current.interactionNodes);
          }
          if (restroomDoorRef.current && (houseMap.group.visible || restroomSceneRef.current?.group.visible)) {
            activeNodes.push(restroomDoorRef.current.interactionNode);
          }
        }
        let closestNode: InteractionNode | null = null;
        let minDistance = Infinity;

        activeNodes.forEach((node) => {
          const nodeVec = new THREE.Vector3(...node.position);
          const dist = playerPos.current.distanceTo(nodeVec);
          if (dist <= node.interactRadius && dist < minDistance) {
            minDistance = dist;
            closestNode = node;
          }
        });

        const closestId = closestNode ? (closestNode as InteractionNode).id : null;
        if (lastActiveNodeIdRef.current !== closestId) {
          lastActiveNodeIdRef.current = closestId;
          onActiveNodeChangeRef.current?.(closestNode);
        }

        // --- CRAYON FLOATING WORLD LABELS PROJECTION UPDATE ---
        const isLabelsBlocked =
          isPausedRef.current ||
          isCinematicPlayingRef.current ||
          isDialogueActiveRef.current ||
          isChoiceActiveRef.current ||
          inspectMode.current !== 'none' ||
          Boolean(activeInspectModal);

        if (isLabelsBlocked) {
          Object.values(labelItemRefs.current).forEach((el) => {
            if (el && el.style.display !== 'none') {
              el.style.display = 'none';
            }
          });
        } else {
          const containerW = container.clientWidth || window.innerWidth;
          const containerH = container.clientHeight || window.innerHeight;
          camera.getWorldDirection(tempCamForward);

          const activeNodeIds = new Set(activeNodes.map((n) => n.id));

          // Hide labels not belonging to active scene
          Object.keys(labelItemRefs.current).forEach((id) => {
            if (!activeNodeIds.has(id)) {
              const el = labelItemRefs.current[id];
              if (el && el.style.display !== 'none') {
                el.style.display = 'none';
              }
            }
          });

          activeNodes.forEach((node) => {
            const el = labelItemRefs.current[node.id];
            if (!el) return;

            // Anchor label position slightly above the object center
            tempNodePos.set(node.position[0], node.position[1] + 0.15, node.position[2]);
            const distToPlayer = playerPos.current.distanceTo(tempNodePos);

            // 1. Show labels only for objects within about 6 units of player
            if (distToPlayer > 6.0) {
              if (el.style.display !== 'none') el.style.display = 'none';
              return;
            }

            // 2. Must be in front of camera
            tempToNode.subVectors(tempNodePos, camera.position);
            if (tempToNode.dot(tempCamForward) <= 0.1) {
              if (el.style.display !== 'none') el.style.display = 'none';
              return;
            }

            // 3. Project to screen
            tempProjected.copy(tempNodePos).project(camera);
            if (tempProjected.z >= 1.0) {
              if (el.style.display !== 'none') el.style.display = 'none';
              return;
            }

            const screenX = (tempProjected.x * 0.5 + 0.5) * containerW;
            const screenY = (-tempProjected.y * 0.5 + 0.5) * containerH;

            // Off-screen boundary check
            if (
              screenX < -120 ||
              screenX > containerW + 120 ||
              screenY < -120 ||
              screenY > containerH + 120
            ) {
              if (el.style.display !== 'none') el.style.display = 'none';
              return;
            }

            const isFocused = closestNode && (closestNode as InteractionNode).id === node.id;

            // Fade in/out smoothly between 4.5 and 6.0 units
            const fade = THREE.MathUtils.clamp((6.0 - distToPlayer) / 1.5, 0, 1);
            // Scale down a little with distance (1.0 down to ~0.72)
            const baseScale = THREE.MathUtils.clamp(1.0 - (distToPlayer / 6.0) * 0.28, 0.72, 1.0);
            const finalScale = isFocused ? baseScale * 1.15 : baseScale;
            const finalOpacity = isFocused ? 1.0 : fade * 0.9;

            el.style.display = 'flex';
            el.style.opacity = `${finalOpacity}`;
            el.style.transform = `translate3d(${screenX.toFixed(1)}px, ${screenY.toFixed(1)}px, 0) translate(-50%, -50%) scale(${finalScale.toFixed(3)})`;
            el.style.zIndex = isFocused ? '35' : '25';

            // Yellow crayon-drawn burst of short rays (focused only)
            const burstEl = labelBurstRefs.current[node.id];
            if (burstEl) {
              burstEl.style.display = isFocused ? 'flex' : 'none';
            }

            // Action prompt next to marker (focused only)
            const actionEl = labelActionRefs.current[node.id];
            if (actionEl) {
              actionEl.style.display = isFocused ? 'flex' : 'none';
            }

            // Action word update if dynamic
            const actionWordEl = labelActionWordRefs.current[node.id];
            const actionWord = getActionWordFromNode(node);
            if (actionWordEl && actionWordEl.getAttribute('data-word') !== actionWord) {
              actionWordEl.setAttribute('data-word', actionWord);
              actionWordEl.textContent = actionWord;
            }

            // Marker gentle pulse
            const markerEl = labelMarkerRefs.current[node.id];
            if (markerEl) {
              if (isFocused) {
                markerEl.classList.add('animate-crayon-pulse');
              } else {
                markerEl.classList.remove('animate-crayon-pulse');
              }
            }

            // Name text styling (bigger and brighter when focused)
            const nameEl = labelNameRefs.current[node.id];
            if (nameEl) {
              nameEl.style.fontSize = isFocused ? '17px' : '13px';
              nameEl.style.color = isFocused ? '#ffffff' : '#f3f4f6';
              nameEl.style.fontWeight = isFocused ? '700' : '500';
              nameEl.style.textShadow = isFocused
                ? '0 2px 8px rgba(0,0,0,0.98), 0 0 14px rgba(254, 240, 138, 0.5), -1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9), -1px 1px 0 rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9)'
                : '0 2px 4px rgba(0,0,0,0.9), -1px -1px 0 rgba(0,0,0,0.8), 1px -1px 0 rgba(0,0,0,0.8), -1px 1px 0 rgba(0,0,0,0.8), 1px 1px 0 rgba(0,0,0,0.8)';
              if (nameEl.getAttribute('data-name') !== node.name) {
                nameEl.setAttribute('data-name', node.name);
                nameEl.textContent = node.name;
              }
            }
          });
        }
      }

      // DEDICATED DEPOT CAMERA CONTROLLER (FINAL WRITER OF THE FRAME)
      const isDepotVisibleNow = Boolean(
        battlefieldSceneRef.current?.group.visible ||
        worldModeRef.current === 'imagination' ||
        currentRoomRef.current === 'battlefield'
      );
      const isCinematicOrOverlayActive = Boolean(
        (cinematicRef.current && cinematicRef.current.state !== 'gameplay') ||
        isBeerCutsceneActiveRef.current ||
        isDialogueActive ||
        isChoiceActive ||
        activeInspectModal ||
        isPowerRestoreOpen ||
        isQuietHandsOpen ||
        isPaused
      );

      if (isDepotVisibleNow && !isCinematicOrOverlayActive) {
        // Camera turning via Arrow keys or Q/E
        const camTurnSpeed = 2.4 * delta;
        if (keysPressed.current['ArrowLeft'] || (!noclipRef.current && keysPressed.current['KeyQ'])) {
          cameraYaw.current += camTurnSpeed;
        }
        if (keysPressed.current['ArrowRight'] || (!noclipRef.current && keysPressed.current['KeyE'])) {
          cameraYaw.current -= camTurnSpeed;
        }
        if (keysPressed.current['ArrowUp']) {
          cameraPitch.current = Math.min(50 * (Math.PI / 180), cameraPitch.current + camTurnSpeed);
        }
        if (keysPressed.current['ArrowDown']) {
          cameraPitch.current = Math.max(-20 * (Math.PI / 180), cameraPitch.current - camTurnSpeed);
        }

        const yaw = cameraYaw.current;
        const pitch = cameraPitch.current;
        const px = playerPos.current.x;
        const py = playerPos.current.y;
        const pz = playerPos.current.z;

        const chestPos = new THREE.Vector3(px, py + 1.2, pz);

        // Third-person Camera Position Formula:
        // Zane + (-sin(yaw) * 4 * cos(pitch), 1.8 + 3 * sin(pitch), -cos(yaw) * 4 * cos(pitch))
        const targetCamPos = new THREE.Vector3(
          px - Math.sin(yaw) * 4.0 * Math.cos(pitch),
          py + 1.8 + 3.0 * Math.sin(pitch),
          pz - Math.cos(yaw) * 4.0 * Math.cos(pitch)
        );

        // Line of sight obstacle check: pull camera closer if cover wall or crate is between camera and Zane
        const camRayDir = targetCamPos.clone().sub(chestPos);
        const maxCamDist = camRayDir.length();
        if (maxCamDist > 0.001) {
          camRayDir.normalize();
          const losRay = new THREE.Ray(chestPos, camRayDir);
          const box3 = new THREE.Box3();
          const hitPoint = new THREE.Vector3();
          let effectiveDist = maxCamDist;

          if (battlefieldSceneRef.current) {
            for (const col of battlefieldSceneRef.current.supplyDepotColliders) {
              box3.min.set(col.minX, 0, col.minZ);
              box3.max.set(col.maxX, col.height ?? 2.5, col.maxZ);
              if (losRay.intersectBox(box3, hitPoint)) {
                const d = chestPos.distanceTo(hitPoint);
                if (d < effectiveDist) {
                  effectiveDist = Math.max(0.6, d - 0.25);
                }
              }
            }
          }
          targetCamPos.copy(chestPos).addScaledVector(camRayDir, effectiveDist);
        }

        // Smooth with 1 - exp(-12 * delta). If camera is > 8 units from Zane, snap immediately.
        const distFromZane = camera.position.distanceTo(playerPos.current);
        if (distFromZane > 8.0) {
          camera.position.copy(targetCamPos);
        } else {
          const lerpFactor = 1.0 - Math.exp(-12.0 * delta);
          camera.position.lerp(targetCamPos, THREE.MathUtils.clamp(lerpFactor, 0.05, 1.0));
        }

        // Clamping: at least 0.9 above ground, depot outer bounds plus 8 units
        camera.position.y = Math.max(0.9, camera.position.y);
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, 487.5, 512.5);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, -21.0, 21.0);

        // Look target smoothly tracks chest
        currentLookTarget.current.lerp(chestPos, 1.0 - Math.exp(-12.0 * delta));
        camera.lookAt(currentLookTarget.current);
      }

      // Frame rate cap: skips rendering until at least 1000 / cap ms have passed while game logic uses real elapsed time
      const frameCap = fpsCapRef.current || 60;
      const minIntervalMs = 1000 / frameCap;
      const elapsedSinceRender = time - lastRenderTimeRef.current;

      if (elapsedSinceRender >= minIntervalMs) {
        lastRenderTimeRef.current = time - (elapsedSinceRender % minIntervalMs);

        // Render frame: in depot, call renderer.render directly (no postprocessing pass, vignette, or grain)
        const isDepotRender = Boolean(
          battlefield.group.visible ||
          worldModeRef.current === 'imagination' ||
          battlefieldSceneRef.current?.supplyDepotGroup.visible
        );

        if (isDepotRender) {
          dutchTiltRef.current = 0;
          renderer.render(scene, camera);
        } else {
          // Dynamic Cyber Postprocessing Pass (only active during hallucination/neon transition)
          const isCyberActive = Boolean(
            isHallwayImaginationRef.current ||
            hallwayNeonTransitionRef.current > 0.01 ||
            glitchTimerRef.current > 0
          );

          if (isCyberActive) {
            const targetDutch = isHallwayImaginationRef.current ? 0.026 : 0.0;
            dutchTiltRef.current = THREE.MathUtils.lerp(dutchTiltRef.current, targetDutch, delta * 4.0);
            camera.rotation.z += dutchTiltRef.current;

            const shakeAmp = 0.003 * hallwayNeonTransitionRef.current * getShakeMultiplier();
            camera.position.x += Math.sin(time * 0.004) * shakeAmp;
            camera.position.y += Math.cos(time * 0.0035) * shakeAmp;

            if (cyberPostPipelineRef.current) {
              cyberPostPipelineRef.current.update(time * 0.001, hallwayNeonTransitionRef.current, glitchIntensity);
              cyberPostPipelineRef.current.render();
            } else {
              renderer.render(scene, camera);
            }
          } else {
            dutchTiltRef.current = 0;
            // Direct renderer call for zero postprocessing overhead in the real world
            renderer.render(scene, camera);
          }
        }
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    // 8. Pointer Lock & Mouse Look Listeners
    const requestLock = () => {
      if (
        isPausedRef.current ||
        isCinematicPlayingRef.current ||
        inspectMode.current !== 'none' ||
        isDialogueActiveRef.current ||
        isChoiceActiveRef.current ||
        isBeerRequestActiveRef.current ||
        isBeerCutsceneActiveRef.current
      ) {
        return;
      }
      const target = wrapperRef.current || container;
      if (!target) return;

      if (document.pointerLockElement !== target) {
        try {
          const promise = target.requestPointerLock?.() as any;
          if (promise && typeof promise.catch === 'function') {
            promise.catch(() => {
              setLookMode('drag');
              lookModeRef.current = 'drag';
            });
          }
        } catch {
          setLookMode('drag');
          lookModeRef.current = 'drag';
        }
      }
    };

    const handleCanvasClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest('button')) {
        return;
      }
      if (
        isPausedRef.current ||
        isCinematicPlayingRef.current ||
        inspectMode.current !== 'none' ||
        isDialogueActiveRef.current ||
        isChoiceActiveRef.current ||
        isBeerRequestActiveRef.current
      ) {
        return;
      }
      requestLock();
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        if (
          !isPausedRef.current &&
          !isCinematicPlayingRef.current &&
          !isDialogueActiveRef.current &&
          !isChoiceActiveRef.current &&
          !isBeerRequestActiveRef.current
        ) {
          const target = wrapperRef.current || container;
          if (document.pointerLockElement !== target) {
            isDraggingRef.current = true;
            setIsDragging(true);
          }
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        isDraggingRef.current = false;
        setIsDragging(false);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const target = wrapperRef.current || container;
      const isLocked = document.pointerLockElement === target;

      if (isLocked || isDraggingRef.current) {
        const sensitivity = 0.0022;
        const mx = e.movementX ?? 0;
        const my = e.movementY ?? 0;

        // Moving right (mx > 0) turns view right
        // Moving left (mx < 0) turns view left
        cameraYaw.current -= mx * sensitivity;

        // Moving up (my < 0 in DOM) looks up (pitch increases)
        // Moving down (my > 0 in DOM) looks down (pitch decreases)
        cameraPitch.current -= my * sensitivity;

        const minPitch = -20 * (Math.PI / 180);
        const maxPitch = 50 * (Math.PI / 180);
        cameraPitch.current = THREE.MathUtils.clamp(cameraPitch.current, minPitch, maxPitch);
      }
    };

    const handlePointerLockChange = () => {
      const target = wrapperRef.current || container;
      const isLocked = Boolean(
        document.pointerLockElement &&
          (document.pointerLockElement === target || document.pointerLockElement === container)
      );
      setIsPointerLocked(isLocked);
      if (isLocked) {
        setLookMode('locked');
        lookModeRef.current = 'locked';
        isDraggingRef.current = false;
        setIsDragging(false);
      } else {
        if (!isDialogueActiveRef.current && !isChoiceActiveRef.current) {
          wasPointerLockedRef.current = false;
        }
      }
    };

    const handlePointerLockError = () => {
      setLookMode('drag');
      lookModeRef.current = 'drag';
      setIsPointerLocked(false);
      isDraggingRef.current = false;
      setIsDragging(false);
    };

    const gameWrapper = wrapperRef.current || container;
    gameWrapper.addEventListener('click', handleCanvasClick);
    gameWrapper.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('pointerlockerror', handlePointerLockError);

    // 9. Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = true;

      if ((e.code === 'KeyE' || e.code === 'Space') && !e.repeat) {
        executeActiveInteraction();
      }

      if (e.code === 'KeyL' && !e.repeat && isDevEnabled) {
        const next = !isFullbrightRef.current;
        isFullbrightRef.current = next;
        setIsFullbright(next);
        onTelltaleNotificationRef.current?.(next ? 'Fullbright ON (+2.5 Ambient, No Fog)' : 'Fullbright OFF');
      }
      if ((e.code === 'Backquote' || e.key === '`') && !e.repeat) {
        if (isDevEnabled) {
          setIsDevMenuOpen((prev) => {
            const next = !prev;
            if (next && document.pointerLockElement) {
              document.exitPointerLock?.();
            }
            return next;
          });
        } else {
          const nextVal = !showDebugRef.current;
          showDebugRef.current = nextVal;
          setShowDebug(nextVal);
          triggerZonesRef.current?.forEach((z) => {
            if (z.helper) z.helper.visible = nextVal;
          });
        }
      }
      if (e.code === 'Escape' && !e.repeat) {
        resetBeerSceneAtmosphere();
        if (isBeerRequestActiveRef.current) {
          isBeerRequestActiveRef.current = false;
          setIsBeerRequestActive(false);
          beerRequestPhaseRef.current = 'idle';
          onSubtitleChangeRef.current?.('', '');
        }
        if (isBeerCutsceneActiveRef.current) {
          if (isDevEnabled) {
            handleSkipBeerCutscene();
          }
        } else if (isDevMenuOpen) {
          setIsDevMenuOpen(false);
        } else if (inspectMode.current !== 'none') {
          exitInspect();
        } else if (document.pointerLockElement) {
          document.exitPointerLock?.();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    const handleWindowBlur = () => {
      keysPressed.current = {};
    };
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      cancelAnimationFrame(animationFrameId);
      gameWrapper.removeEventListener('click', handleCanvasClick);
      gameWrapper.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('pointerlockerror', handlePointerLockError);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('game_settings_changed', handleSettingsChanged);

      disposeObject3D(scene);
      scene.clear();

      if (rendererRef.current && rendererRef.current.domElement) {
        if (rendererRef.current.domElement.parentNode === container) {
          container.removeChild(rendererRef.current.domElement);
        }
      }
    };
  }, []); // Run setup strictly ONCE on mount!

  // Automatic pointer release during dialogue, timed choices, inspect modal, and cinematics,
  // and re-lock automatically when state ends
  const prevCinematicRef = useRef(isCinematicPlaying);
  const prevDialogueRef = useRef(isDialogueActive);
  const prevChoiceRef = useRef(isChoiceActive);
  const prevInspectModalRef = useRef(activeInspectModal);

  useEffect(() => {
    const isNowBlocked = isDialogueActive || isChoiceActive || isCinematicPlaying || Boolean(activeInspectModal);
    const wasBlocked =
      prevDialogueRef.current ||
      prevChoiceRef.current ||
      prevCinematicRef.current ||
      Boolean(prevInspectModalRef.current);

    if (isNowBlocked) {
      const target = wrapperRef.current || containerRef.current;
      if (
        document.pointerLockElement &&
        (document.pointerLockElement === target || document.pointerLockElement === containerRef.current)
      ) {
        wasPointerLockedRef.current = true;
        document.exitPointerLock?.();
      }
    } else if (wasBlocked && !isNowBlocked) {
      // Control returns to player: restore camera behind character
      cameraYaw.current = playerRotation.current;
      cameraPitch.current = 0;

      // Try to re-lock immediately (in a try/catch), since browsers sometimes allow it
      try {
        const target = wrapperRef.current || containerRef.current;
        const p = target?.requestPointerLock?.() as any;
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      } catch {
        // Handled on next user click if blocked by browser policy
      }
    }

    prevCinematicRef.current = isCinematicPlaying;
    prevDialogueRef.current = isDialogueActive;
    prevChoiceRef.current = isChoiceActive;
    prevInspectModalRef.current = activeInspectModal;
  }, [isDialogueActive, isChoiceActive, isCinematicPlaying, activeInspectModal]);

  // Update visible scene with intentional screen wipe and whoosh when currentLocation changes
  useEffect(() => {
    if (!bedroomSceneRef.current || !houseSceneRef.current || !battlefieldSceneRef.current) return;
    if (cinematicRef.current && cinematicRef.current.state !== 'gameplay') {
      return;
    }

    if (currentLocation === 'battlefield') {
      triggerImaginationWipe(true, () => {
        if (sceneRef.current) {
          sceneRef.current.background = new THREE.Color(0x09111e);
          sceneRef.current.fog = new THREE.FogExp2(0x09111e, 0.03);
        }
        if (battlefieldSceneRef.current && bedroomSceneRef.current && houseSceneRef.current && characterRef.current) {
          battlefieldSceneRef.current.group.visible = true;
          bedroomSceneRef.current.group.visible = false;
          houseSceneRef.current.group.visible = false;
          characterRef.current.setCombatLook(true);
          playerPos.current.set(0, 0, 0);
          playerRotation.current = Math.PI;
          cameraYaw.current = Math.PI;
          cameraPitch.current = 0;
        }
      });
    } else {
      triggerImaginationWipe(false, () => {
        if (sceneRef.current) {
          sceneRef.current.background = new THREE.Color(0xded0bb);
          sceneRef.current.fog = null;
        }
        if (battlefieldSceneRef.current && bedroomSceneRef.current && houseSceneRef.current && characterRef.current) {
          battlefieldSceneRef.current.group.visible = false;
          characterRef.current.setCombatLook(false);

          if (currentLocation === 'bedroom') {
            bedroomSceneRef.current.group.visible = true;
            houseSceneRef.current.group.visible = false;
            playerPos.current.set(0, 0, 3.2);
            playerRotation.current = Math.PI;
            cameraYaw.current = Math.PI;
            cameraPitch.current = 0;
          } else if (currentLocation === 'house_map') {
            bedroomSceneRef.current.group.visible = false;
            houseSceneRef.current.group.visible = true;
            playerPos.current.set(0, 0, 1.2);
            playerRotation.current = 0;
            cameraYaw.current = 0;
            cameraPitch.current = 0;
          }
        }
      });
    }
  }, [currentLocation, triggerImaginationWipe]);

  // Handle Inspect Close from UI
  useEffect(() => {
    if (!activeInspectModal && inspectMode.current !== 'none') {
      triggerCinematicCut();
      inspectMode.current = 'none';
      soundEngine.stopLofiSynth();
      cameraYaw.current = playerRotation.current;
      cameraPitch.current = 0;
      try {
        const target = wrapperRef.current || containerRef.current;
        const p = target?.requestPointerLock?.() as any;
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {}
    }
  }, [activeInspectModal, triggerCinematicCut]);

  const exitInspect = useCallback(() => {
    triggerCinematicCut();
    inspectMode.current = 'none';
    soundEngine.stopLofiSynth();
    cameraYaw.current = playerRotation.current;
    cameraPitch.current = 0;
    try {
      const target = wrapperRef.current || containerRef.current;
      const p = target?.requestPointerLock?.() as any;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {}
    onCloseInspect();
  }, [onCloseInspect, triggerCinematicCut]);

  // Execute interaction when player presses 'E'
  const executeActiveInteraction = useCallback(() => {
    if (isBeerCutsceneActiveRef.current) return;
    if (!bedroomSceneRef.current || !houseSceneRef.current) return;

    // Collect active nodes matching frame loop detection logic
    const activeNodes: InteractionNode[] = [];
    if (worldModeRef.current === 'imagination') {
      activeNodes.push({
        id: 'supply_capsule',
        name: 'Beer Bottle',
        position: [500, 1.2, 11.2],
        promptKey: 'E',
        promptVerb: 'Take',
        interactRadius: 2.5,
        description: 'Chilled beer bottle on the raised platform.',
      });
    } else if (currentRoomRef.current === 'basement' || playerPos.current.y <= -0.15 || (playerPos.current.x >= 1.82 && playerPos.current.z >= 9.8 && playerPos.current.z <= 12.2)) {
      // In basement or stairwell: ONLY basement nodes and basement door
      if (basementSceneRef.current && basementSceneRef.current.group.visible) {
        activeNodes.push(...basementSceneRef.current.interactionNodes);
      }
      if (basementDoorRef.current) {
        activeNodes.push(basementDoorRef.current.interactionNode);
      }
    } else {
      if (bedroomSceneRef.current.group.visible) {
        activeNodes.push(...bedroomSceneRef.current.interactionNodes.filter((n) => n.id !== 'bedroom_door'));
      }
      if (houseSceneRef.current.group.visible) {
        activeNodes.push(
          ...houseSceneRef.current.interactionNodes.filter((n) => {
            if (n.id === 'house_workshop' || n.id === 'house_basement' || n.id === 'house_restroom' || n.id === 'house_return_bedroom') return false;
            if (n.id === 'kitchen_drawer' && storyStateRef.current.quests.kitchen_key !== 'active') return false;
            return true;
          })
        );
      }
      if (bedroomDoorRef.current && (bedroomSceneRef.current.group.visible || houseSceneRef.current.group.visible)) {
        activeNodes.push(bedroomDoorRef.current.interactionNode);
      }
      if (workshopDoorRef.current && (houseSceneRef.current.group.visible || workshopSceneRef.current?.group.visible)) {
        activeNodes.push(workshopDoorRef.current.interactionNode);
      }
      if (workshopSceneRef.current && (houseSceneRef.current.group.visible || workshopSceneRef.current.group.visible)) {
        activeNodes.push(...workshopSceneRef.current.interactionNodes);
      }
      if (storyStateRef.current.hasWrench && storyStateRef.current.quests.deliver_wrench !== 'completed') {
        const isDadReady = Boolean(dadCharacterRef.current && dadCharacterRef.current.isLoaded);
        const dadWrenchPos: [number, number, number] = isDadReady
          ? [dadCharacterRef.current!.group.position.x + 0.4, 1.45, dadCharacterRef.current!.group.position.z]
          : [-6.6, 1.25, 7.5];

        activeNodes.push({
          id: 'dad_give_wrench',
          name: 'Give wrench',
          position: dadWrenchPos,
          promptKey: 'E',
          promptVerb: 'Give wrench',
          description: 'Hand the mechanic wrench to Dad at the workbench.',
          interactRadius: 2.5,
        });
      }
      if (basementDoorRef.current && (houseSceneRef.current.group.visible || basementSceneRef.current?.group.visible)) {
        activeNodes.push(basementDoorRef.current.interactionNode);
      }
      if (basementSceneRef.current && (houseSceneRef.current.group.visible || basementSceneRef.current?.group.visible)) {
        activeNodes.push(...basementSceneRef.current.interactionNodes);
      }
      if (restroomDoorRef.current && (houseSceneRef.current.group.visible || restroomSceneRef.current?.group.visible)) {
        activeNodes.push(restroomDoorRef.current.interactionNode);
      }
    }

    let closestNode: InteractionNode | null = null;
    let minDistance = Infinity;

    activeNodes.forEach((node) => {
      const nodeVec = new THREE.Vector3(...node.position);
      const dist = playerPos.current.distanceTo(nodeVec);
      if (dist <= node.interactRadius && dist < minDistance) {
        minDistance = dist;
        closestNode = node;
      }
    });

    if (!closestNode) return;
    const node = closestNode as InteractionNode;
    soundEngine.playInteract();

    // Reaching Supply Capsule in Supply Depot
    if (worldModeRef.current === 'imagination' && node.id === 'supply_capsule') {
      soundEngine.playItemPickup();
      soundEngine.speakLine('Got it.', 'zane');
      onSubtitleChangeRef.current?.('Zane', '“Got it.”');

      // Exit pointer lock immediately
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      setIsPointerLocked(false);

      const startFinalCutscene = () => {
        isBeerCutsceneActiveRef.current = true;
        setIsBeerCutsceneActive(true);
        beerCutscenePhaseRef.current = 'phase1_chair_fall';
        setBeerCutscenePhase('phase1_chair_fall');
        beerCutsceneTimerRef.current = 0;
        beerCutsceneSubTimerRef.current = 0;
      };

      // Ensure clips are loaded before cutscene starts; if not ready, wait up to 3 seconds, then use fallback
      const clipsToCheck = ['dad_walk', 'monster_walk', 'monster_run', 'ty_injured_walk'];
      const startTime = performance.now();
      const checkInterval = setInterval(() => {
        const statuses = getClipStatuses();
        const allSettled = clipsToCheck.every(
          (c) => statuses[c]?.status === 'loaded' || statuses[c]?.status === 'failed'
        );
        const elapsed = performance.now() - startTime;
        if (allSettled || elapsed >= 3000) {
          clearInterval(checkInterval);
          startFinalCutscene();
        }
      }, 100);
      return;
    }

    // Check if node corresponds to any HouseDoor instance
    const doors = [
      bedroomDoorRef.current,
      workshopDoorRef.current,
      basementDoorRef.current,
      restroomDoorRef.current,
    ].filter(Boolean) as InteractiveDoor[];

    const matchedDoor = doors.find((d) => d.id === node.id || d.interactionNode.id === node.id);

    if (matchedDoor) {
      if (matchedDoor.isLocked) {
        soundEngine.playRadioStatic();
        if (matchedDoor.id === 'house_workshop') {
          if (storyStateRef.current.hasWrench) {
            matchedDoor.setLocked(false);
            matchedDoor.open();
          } else {
            onSubtitleChangeRef.current?.(
              'Dad (Through Door)',
              '“Zane! Careful around the hallway, I’m oiling the door hinges in the workshop!”'
            );
            soundEngine.speakLine(
              'Zane! Careful around the hallway, I am oiling the door hinges in the workshop!',
              'dad'
            );
            onTelltaleNotificationRef.current?.('Locked: Dad is in the Workshop');
            soundEngine.playTelltaleBell();
          }
        } else if (matchedDoor.id === 'house_basement') {
          onSubtitleChangeRef.current?.(
            'Zane',
            '“Locked. The key has to be somewhere in the house.”'
          );
          soundEngine.speakLine(
            'Locked. The key has to be somewhere in the house.',
            'zane'
          );
          onTelltaleNotificationRef.current?.('Locked: Key Required');
          soundEngine.playTelltaleBell();
        }
        console.log('[Door Interaction]', matchedDoor.id, 'is LOCKED, isOpen:', matchedDoor.isOpen);
      } else {
        matchedDoor.toggle(playerPos.current);
        soundEngine.playDoorCreak();
        console.log('[Door Interaction]', matchedDoor.id, 'toggled -> isOpen:', matchedDoor.isOpen, 'pivotRotationY:', matchedDoor.pivotGroup.rotation.y);
      }
      return;
    }

    // 1. TARGET: Drawings
    if (node.id === 'bedroom_drawings') {
      if (!completedCutscenesRef.current?.drawings_imagination && cinematicRef.current) {
        triggerImaginationWipe(true, () => {
          setWorldModeRef.current?.('imagination');
          playerPos.current.set(0, 0, 0);
          if (battlefieldSceneRef.current) {
            battlefieldSceneRef.current.clearPath();
          }
          cinematicRef.current?.startCutscene('drawings_imagination', completedCutscenesRef.current);
        });
      } else {
        triggerCinematicCut();
        dialogueDolly.current = 0;
        inspectMode.current = 'drawings';
        onSubtitleChangeRef.current?.('Zane', '“My crayon drawings of space cruisers and distant galaxies.”');
        soundEngine.speakLine('My crayon drawings of space cruisers and distant galaxies.', 'zane');
        onTelltaleNotificationRef.current?.('Space Drawings Inspected');
        soundEngine.playTelltaleBell();
      }
    }
    // 2. TARGET: Cabinet
    else if (node.id === 'bedroom_cabinet') {
      const isOpen = bedroomSceneRef.current.toggleCabinet();
      soundEngine.playDoorCreak();
      if (isOpen) {
        onSubtitleChangeRef.current?.('Zane', '“My favorite comic books and school notebooks are neatly stacked inside.”');
        soundEngine.speakLine('My favorite comic books and school notebooks are neatly stacked inside.', 'zane');
        onTelltaleNotificationRef.current?.('Wooden Cabinet Opened');
      } else {
        onSubtitleChangeRef.current?.('Zane', '“Cabinet door closed.”');
      }
    }
    // 3. TARGET: Window
    else if (node.id === 'bedroom_window') {
      triggerCinematicCut();
      dialogueDolly.current = 0;
      inspectMode.current = 'window';
      soundEngine.startLofiSynth();
      onSubtitleChangeRef.current?.(
        'Zane',
        '“Bright sunny morning outside. The trees are green and the sky is clear.”'
      );
      soundEngine.speakLine('Bright sunny morning outside. The trees are green and the sky is clear.', 'zane');
      onTelltaleNotificationRef.current?.('Sunny Neighborhood Vista Observed');
      soundEngine.playTelltaleBell();
    }
    // HOUSE MAP NODES
    else if (node.id === 'house_tv') {
      triggerCinematicCut();
      dialogueDolly.current = 0;
      inspectMode.current = 'holo_tv';
      soundEngine.playRadioStatic();
      onSubtitleChangeRef.current?.(
        'TV Broadcaster',
        '“Good morning! It is a beautiful sunny 72 degrees in the neighborhood today!”'
      );
      soundEngine.speakLine('Good morning! It is a beautiful sunny 72 degrees in the neighborhood today!', 'dad');
      onTelltaleNotificationRef.current?.('Morning News Observed');
      soundEngine.playTelltaleBell();
    } else if (node.id === 'house_kitchen') {
      onSubtitleChangeRef.current?.('Zane', '“Fresh red apples in the fruit bowl and breakfast toast on the kitchen counter.”');
      soundEngine.speakLine('Fresh red apples in the fruit bowl and breakfast toast on the kitchen counter.', 'zane');
      onTelltaleNotificationRef.current?.('Kitchen Counter Inspected');
    } else if (node.id.startsWith('hallway_panel_') || node.id === 'hallway_pictures') {
      if (isHallwayImaginationRef.current) {
        const panel = houseSceneRef.current?.hallwayPanels.find((p) => p.id === node.id);
        if (panel?.isAligned) {
          onSubtitleChangeRef.current?.('Zane', '“Hull panel is aligned and secured.”');
          soundEngine.speakLine('Hull panel is aligned and secured.', 'zane');
        } else {
          // Open jigsaw puzzle overlay
          document.exitPointerLock?.();
          isPuzzleOpenRef.current = true;
          setActivePuzzlePanelId(node.id);
        }
      } else {
        const panel = houseSceneRef.current?.hallwayPanels.find((p) => p.id === node.id);
        if (panel?.isAligned || storyStateRef.current.quests.hallway_pictures === 'completed') {
          onSubtitleChangeRef.current?.('Zane', '“Nice and straight now.”');
          soundEngine.speakLine('Nice and straight now.', 'zane');
        } else if (storyStateRef.current.quests.hallway_pictures === 'active') {
          // If player interacts directly with crooked frame before walking on trigger
          onSubtitleChangeRef.current?.('Zane', '“...Crooked. Ugh, I can’t walk past that.”');
          soundEngine.speakLine("...Crooked. Ugh, I can't walk past that.", 'zane');

          setTimeout(() => {
            triggerImaginationWipe(true, () => {
              isHallwayImaginationRef.current = true;
              setIsHallwayImagination(true);
              houseSceneRef.current?.setImaginationMode(true);
            });

            setTimeout(() => {
              onSubtitleChangeRef.current?.(
                'Zane',
                '“Command, hull panels are out of alignment. I’m on it.”'
              );
              soundEngine.speakLine(
                "Command, hull panels are out of alignment. I'm on it.",
                'zane'
              );
              soundEngine.playRadioStatic();
            }, 300);
          }, 1200);
        } else {
          onSubtitleChangeRef.current?.('Zane', '“Framed pictures on the wall.”');
          soundEngine.speakLine('Framed pictures on the wall.', 'zane');
        }
      }
    } else if (node.id === 'kitchen_drawer' || node.id === 'kitchen_key') {
      if (storyStateRef.current.quests.kitchen_key === 'active') {
        soundEngine.playSoftClick();
        isQuietHandsOpenRef.current = true;
        setIsQuietHandsOpen(true);
      } else if (storyStateRef.current.quests.kitchen_key === 'completed') {
        onSubtitleChangeRef.current?.('Zane', '“Already retrieved the key from the drawer.”');
        soundEngine.speakLine('Already retrieved the key from the drawer.', 'zane');
      } else {
        onSubtitleChangeRef.current?.('Zane', '“A kitchen drawer next to the fridge.”');
        soundEngine.speakLine('A kitchen drawer next to the fridge.', 'zane');
      }
    } else if (node.id === 'basement_breaker_box') {
      if (!storyStateRef.current.hasPower) {
        soundEngine.playSoftClick();
        setIsPowerRestoreOpen(true);
      } else {
        onSubtitleChangeRef.current?.('Zane', '“Power is already restored.”');
        soundEngine.speakLine('Power is already restored.', 'zane');
      }
    } else if (node.id === 'basement_wrench') {
      if (!storyStateRef.current.hasPower) {
        return;
      }
      storyStateRef.current.hasWrench = true;
      storyStateRef.current.quests.basement_wrench = 'completed';
      storyStateRef.current.quests.deliver_wrench = 'active';

      basementSceneRef.current?.hideWrench();

      if (workshopDoorRef.current) {
        workshopDoorRef.current.setLocked(false);
        workshopDoorRef.current.interactionNode.promptVerb = 'Open';
        workshopDoorRef.current.interactionNode.name = "Dad's Workshop";
        workshopDoorRef.current.interactionNode.description = "Press E to open Dad's Workshop door.";
      }

      soundEngine.playItemPickup();
      onSubtitleChangeRef.current?.(
        'Zane',
        '“Found Dad’s wrench! I should bring it up to him in the workshop.”'
      );
      soundEngine.speakLine(
        "Found Dad's wrench! I should bring it up to him in the workshop.",
        'zane'
      );
      onTelltaleNotificationRef.current?.('Mechanic Wrench Acquired');
      soundEngine.playTelltaleBell();
      onStoryStateChangeRef.current?.(storyStateRef.current);
    } else if (node.id === 'dad_give_wrench') {
      if (!storyStateRef.current.hasWrench) return;

      isWrenchHandoffRef.current = true;
      wrenchHandoffTimerRef.current = 0;
      wrenchHandoffStartPosRef.current.copy(playerPos.current);

      // Target position: Zane steps toward Dad and the workbench
      const benchTarget = new THREE.Vector3(-6.2, 0, 7.5);
      const toBench = benchTarget.clone().sub(playerPos.current);
      const stepDist = Math.min(1.2, toBench.length());
      const stepDir = toBench.length() > 0.01 ? toBench.normalize() : new THREE.Vector3(-1, 0, 0);
      wrenchHandoffTargetPosRef.current.copy(playerPos.current).addScaledVector(stepDir, stepDist);

      // Zane faces Dad and the workbench
      playerRotation.current = -Math.PI / 2;
      cameraYaw.current = -Math.PI / 2;

      // After stepping toward the bench (0.6s): set wrench on bench & Dad speaks without turning
      setTimeout(() => {
        workshopSceneRef.current?.placeWrench();
        soundEngine.playItemPickup();

        storyStateRef.current.hasWrench = false;
        storyStateRef.current.quests.deliver_wrench = 'completed';
        onStoryStateChangeRef.current?.(storyStateRef.current);

        // Dad says without turning: "Good job."
        onSubtitleChangeRef.current?.('Dad', '“Good job.”');
        soundEngine.speakLine('Good job.', 'dad');
        onTelltaleNotificationRef.current?.('Quest Completed: Delivered Wrench to Dad');
        soundEngine.playTelltaleBell();

        // Then he walks to the sofa along fixed waypoints
        setTimeout(() => {
          isWrenchHandoffRef.current = false;
          if (dadCharacterRef.current) {
            dadWalkProgressRef.current = 0;
            dadCharacterRef.current.startWalkToSofa(() => {
              dadWalkProgressRef.current = 1;
              if (beerTimerRef.current) clearTimeout(beerTimerRef.current);
              beerTimerRef.current = setTimeout(() => {
                startBeerRequestScene();
              }, 5000);
            });
          }
        }, 1200);
      }, 600);
    }
  }, [triggerCinematicCut, triggerImaginationWipe]);

  const getCursorClass = () => {
    if (isPointerLocked) return 'cursor-none';
    if (
      isCinematicPlaying ||
      isDialogueActive ||
      isChoiceActive ||
      Boolean(activeInspectModal) ||
      inspectMode.current !== 'none'
    ) {
      return 'cursor-default';
    }
    if (lookMode === 'drag') {
      return isDragging ? 'cursor-grabbing' : 'cursor-grab';
    }
    return 'cursor-crosshair';
  };

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full h-full select-none overflow-hidden ${getCursorClass()} ${
        screenShakeActive ? 'animate-screen-shake' : ''
      }`}
      style={{
        transform: `translate3d(${cssVibration.x}px, ${cssVibration.y}px, 0)`,
        filter: `saturate(${Math.max(0.1, 1.0 - heavyAtmosphereDesat)})`,
      }}
    >
      {/* 3D WebGL Canvas Container with Comic Contrast */}
      <div ref={containerRef} className="w-full h-full contrast-[1.04] saturate-[1.02]" />

      {/* Heavy Dread Atmosphere Tightening Vignette (real world only) */}
      {heavyAtmosphereVignette > 0 && worldModeRef.current !== 'imagination' && (
        <div
          className="pointer-events-none absolute inset-0 z-40 transition-opacity"
          style={{
            opacity: heavyAtmosphereVignette,
            background: 'radial-gradient(ellipse at center, transparent 30%, rgba(10, 5, 5, 0.94) 100%)',
          }}
        />
      )}

      {/* Short Chromatic Aberration Pulse Overlay at Shout (real world only) */}
      {chromaPulse > 0.01 && worldModeRef.current !== 'imagination' && (
        <div
          className="pointer-events-none absolute inset-0 z-40 mix-blend-screen transition-opacity"
          style={{
            opacity: chromaPulse * 0.75,
            background:
              'radial-gradient(circle, transparent 20%, rgba(239, 68, 68, 0.35) 75%, rgba(6, 182, 212, 0.45) 100%)',
          }}
        />
      )}

      {/* Floating Hand-Drawn Crayon Adventure World Labels */}
      <CrayonFloatingLabels
        onExecuteInteraction={executeActiveInteraction}
        registerItemRef={registerItemRef}
        registerNameRef={registerNameRef}
        registerBurstRef={registerBurstRef}
        registerActionRef={registerActionRef}
        registerActionWordRef={registerActionWordRef}
        registerMarkerRef={registerMarkerRef}
      />

      {/* Skip Cutscene Button (Only allowed when ?dev=1 is present) */}
      {isBeerCutsceneActive && isDevEnabled && (
        <button
          onClick={handleSkipBeerCutscene}
          className="fixed top-6 right-6 z-[110] px-4 py-2 bg-neutral-900/90 hover:bg-neutral-800 text-yellow-300 border border-yellow-500/40 rounded-xl font-mono text-xs font-bold shadow-xl transition-all cursor-pointer active:scale-95"
        >
          [DEV] Skip Cutscene ⏭
        </button>
      )}

      {/* Soft Blur Vignette Overlay (real world only) */}
      {softBlurVignette && worldModeRef.current !== 'imagination' && (
        <div
          className="pointer-events-none absolute inset-0 z-40 backdrop-blur-[2px]"
          style={{
            background: 'radial-gradient(circle, transparent 35%, rgba(15, 23, 42, 0.88) 100%)',
          }}
        />
      )}

      {/* Large Shaking Subtitle Overlay */}
      {largeShakingSubtitle && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-50 flex items-center justify-center p-4">
          <div className="bg-red-950/90 border-2 border-red-500 text-red-100 font-extrabold text-2xl md:text-4xl px-8 py-4 rounded-2xl shadow-2xl tracking-widest uppercase animate-bounce text-center transform -rotate-1">
            {largeShakingSubtitle}
          </div>
        </div>
      )}

      {/* Two Feathered Black Eyelids for Natural Eye Blink */}
      {eyelidProgress > 0 && isBeerCutsceneActive && (
        <div className="pointer-events-none fixed inset-0 z-[90] overflow-hidden">
          {/* Top Eyelid */}
          <div
            className="absolute top-0 left-0 right-0 h-[52%] bg-black transition-transform duration-75"
            style={{
              transform: `translateY(${-100 + eyelidProgress * 100}%)`,
              background: 'linear-gradient(to bottom, #000000 70%, rgba(0, 0, 0, 0.95) 88%, rgba(0, 0, 0, 0.6) 96%, transparent 100%)',
              boxShadow: '0 30px 60px rgba(0, 0, 0, 0.95)',
            }}
          />
          {/* Bottom Eyelid */}
          <div
            className="absolute bottom-0 left-0 right-0 h-[52%] bg-black transition-transform duration-75"
            style={{
              transform: `translateY(${100 - eyelidProgress * 100}%)`,
              background: 'linear-gradient(to top, #000000 70%, rgba(0, 0, 0, 0.95) 88%, rgba(0, 0, 0, 0.6) 96%, transparent 100%)',
              boxShadow: '0 -30px 60px rgba(0, 0, 0, 0.95)',
            }}
          />
        </div>
      )}

      {/* Red Vignette Pulse Overlay for Stealth Detection */}
      <div
        className={`pointer-events-none absolute inset-0 z-40 transition-opacity duration-200 ${
          redVignettePulse ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background: 'radial-gradient(circle, transparent 40%, rgba(239, 68, 68, 0.75) 100%)',
        }}
      />

      {/* Tightening Red Vignette Overlay During Chase */}
      {chaseVignetteOpacity > 0 && !isHardCutBlack && !isFullbright && (
        <div
          className="pointer-events-none absolute inset-0 z-40 transition-opacity duration-300"
          style={{
            opacity: chaseVignetteOpacity,
            background: 'radial-gradient(circle, transparent 25%, rgba(185, 28, 28, 0.85) 100%)',
          }}
        />
      )}

      {/* Hard Cut to Black Overlay */}
      {isHardCutBlack && (
        <div className="fixed inset-0 z-[100] bg-black pointer-events-auto" />
      )}

      {/* End Card Overlay */}
      {showEndCard && (
        <EndCard onBackToMenu={handleEndCardBackToMenu} />
      )}

      {/* Intentional Comic Imagination / Reality Screen Wipe Overlay */}
      <div
        className={`pointer-events-none absolute inset-0 z-50 overflow-hidden transition-all duration-300 ease-in-out ${
          screenWipeActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className={`absolute inset-0 transition-transform duration-300 ease-in-out ${
            screenWipeActive ? 'translate-x-0' : wipeMode === 'to_imagination' ? '-translate-x-full' : 'translate-x-full'
          } ${
            wipeMode === 'to_imagination'
              ? 'bg-neutral-950 border-r border-neutral-700'
              : 'bg-neutral-100 border-l border-neutral-300'
          }`}
        >
          {/* Comic action speedlines */}
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <div
              className={`text-lg md:text-xl font-bold tracking-widest uppercase font-mono ${
                wipeMode === 'to_imagination' ? 'text-white' : 'text-neutral-900'
              }`}
            >
              {wipeMode === 'to_imagination' ? 'Entering Imagination' : 'Returning to Bedroom'}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Debug Overlay (Toggled with backtick ` key, off by default) */}
      {showDebug && (
        <div className="absolute bottom-4 right-4 z-40 pointer-events-none">
          <div className="px-3 py-2 rounded-lg text-[10px] font-mono tracking-wider bg-black/90 text-neutral-300 border border-neutral-800 shadow-xl flex flex-col gap-1">
            <div className="text-white font-bold border-b border-neutral-800 pb-0.5 mb-0.5">DEBUG INFO (`)</div>
            <div><span className="text-neutral-500">Keys:</span> {debugHudData.keys}</div>
            <div><span className="text-neutral-500">Pointer Locked:</span> {debugHudData.pointerLocked ? 'Yes' : 'No'}</div>
            <div><span className="text-neutral-500">Look Mode:</span> {debugHudData.lookMode}</div>
            <div><span className="text-neutral-500">State:</span> {debugHudData.gameState}</div>
            <div><span className="text-neutral-500">Pos:</span> ({debugHudData.pos})</div>
            <div><span className="text-neutral-500">Camera Yaw:</span> {debugHudData.camYaw} rad</div>
            <div><span className="text-neutral-500">Character Yaw:</span> {debugHudData.charYaw} rad</div>
            <div><span className="text-neutral-500">Nearest Door:</span> <span className="text-emerald-400 font-bold">{debugHudData.nearestDoor}</span></div>
            <div><span className="text-neutral-500">Lighting Info:</span> <span className="text-amber-300 font-bold">{debugHudData.lightingInfo}</span></div>
            {debugHudData.questDebug && (
              <div><span className="text-neutral-500">Quests:</span> <span className="text-purple-300 font-bold">{debugHudData.questDebug}</span></div>
            )}
            {debugHudData.projectileDebug && (
              <div><span className="text-neutral-500">Projectiles:</span> <span className="text-cyan-400 font-bold">{debugHudData.projectileDebug}</span></div>
            )}
            {debugHudData.cutsceneDebug && (
              <div className="border-t border-neutral-800 mt-1 pt-1"><span className="text-yellow-400 font-bold">Cutscene:</span> <span className="text-cyan-400 font-bold">{debugHudData.cutsceneDebug}</span></div>
            )}
          </div>
        </div>
      )}

      {/* Inspect Mode Return Button Overlay */}
      {inspectMode.current !== 'none' && (
        <div className="absolute top-6 right-6 z-40">
          <button
            onClick={exitInspect}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900/90 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-lg text-xs font-mono transition-colors cursor-pointer"
          >
            <span>[ESC] Return</span>
          </button>
        </div>
      )}

      {/* Hallway Jigsaw Puzzle Overlay */}
      {activePuzzlePanelId && (
        <HallwayJigsawPuzzle
          panelId={activePuzzlePanelId}
          onClose={() => {
            isPuzzleOpenRef.current = false;
            setActivePuzzlePanelId(null);
          }}
          onComplete={handlePuzzleComplete}
          onSubtitleChange={(speaker, text) => {
            onSubtitleChangeRef.current?.(speaker, text);
          }}
        />
      )}

      {/* Quiet Hands Minigame Overlay */}
      {isQuietHandsOpen && (
        <QuietHandsMinigame
          isOpen={isQuietHandsOpen}
          onClose={() => {
            isQuietHandsOpenRef.current = false;
            setIsQuietHandsOpen(false);
          }}
          onWin={handleQuietHandsWin}
          onSubtitleChange={(speaker, text) => {
            onSubtitleChangeRef.current?.(speaker, text);
          }}
          onTelltaleNotification={(text) => {
            onTelltaleNotificationRef.current?.(text);
          }}
        />
      )}

      {/* Power Restore Minigame Overlay */}
      {isPowerRestoreOpen && (
        <PowerRestoreMinigame
          isOpen={isPowerRestoreOpen}
          onClose={() => {
            isPowerRestoreOpenRef.current = false;
            setIsPowerRestoreOpen(false);
          }}
          onWin={handlePowerRestoreWin}
          onSubtitleChange={(speaker, text) => {
            onSubtitleChangeRef.current?.(speaker, text);
          }}
          onTelltaleNotification={(text) => {
            onTelltaleNotificationRef.current?.(text);
          }}
        />
      )}



      {/* Hidden Developer Menu (only accessible if ?dev=1 in URL) */}
      {isDevEnabled && (
        <DeveloperMenu
          isOpen={isDevMenuOpen}
          onClose={() => setIsDevMenuOpen(false)}
          storyState={storyStateRef.current}
          currentRoom={currentRoomRef.current}
          isImagination={Boolean(battlefieldSceneRef.current?.group.visible || isHallwayImaginationRef.current)}
          fps={fpsVal}
          frameTimeMs={frameTimeVal}
          errorCount={errorCount}
          noclip={noclip}
          onToggleNoclip={() => {
            const next = !noclipRef.current;
            noclipRef.current = next;
            setNoclip(next);
            onTelltaleNotificationRef.current?.(next ? 'Noclip ON (Q/E Fly)' : 'Noclip OFF');
          }}
          speedMultiplier={speedMultiplier}
          onChangeSpeedMultiplier={(mult) => {
            speedMultiplierRef.current = mult;
            setSpeedMultiplier(mult);
            onTelltaleNotificationRef.current?.(`Speed: ${mult}x`);
          }}
          onUnstick={() => {
            playerPos.current.copy(lastSafePos.current);
            onTelltaleNotificationRef.current?.('Unstuck to safe spot');
          }}
          onTeleport={handleDevTeleport}
          onSetQuestStatus={handleDevSetQuestStatus}
          onCompleteQuestsUpTo={handleDevCompleteQuestsUpTo}
          onToggleInventory={handleDevToggleInventory}
          onForceImagination={(active) => triggerImaginationWipe(active)}
          onResetImagination={() => {
            triggerImaginationWipe(false);
            isHallwayImaginationRef.current = false;
            setIsHallwayImagination(false);
            houseSceneRef.current?.setImaginationMode(false);
          }}
          onTriggerCutscene={handleDevTriggerCutscene}
          onTriggerQuietHands={() => setIsQuietHandsOpen(true)}
          onResetEverything={handleDevResetEverything}
          onSaveSnapshot={handleDevSaveSnapshot}
          onLoadSnapshot={handleDevLoadSnapshot}
          isHurt={isZaneHurt}
          onToggleHurt={() => {
            if (characterRef.current) {
              const next = !characterRef.current.isHurt;
              characterRef.current.setHurt(next);
              setIsZaneHurt(next);
              onTelltaleNotificationRef.current?.(next ? 'Zane Injured: ON (50% speed + limp sway)' : 'Zane Injured: OFF');
            }
          }}
          onTriggerFall={() => {
            if (characterRef.current) {
              characterRef.current.fall();
              onTelltaleNotificationRef.current?.('Zane: FALL Animation Played');
            }
          }}
          dadState={dadAnimState}
          onChangeDadState={(st) => {
            if (dadCharacterRef.current) {
              dadCharacterRef.current.playState(st, 0.3);
              setDadAnimState(st);
              onTelltaleNotificationRef.current?.(`Dad: ${st}`);
            }
          }}
          sofaSeatOffset={sofaSeatOffset}
          onChangeSofaSeatOffset={handleSofaSeatOffsetChange}
          worldMode={worldModeRef.current}
          currentLocation={currentLocation}
          playerPosition={`${playerPos.current.x.toFixed(1)}, ${playerPos.current.y.toFixed(1)}, ${playerPos.current.z.toFixed(1)}`}
          lastTriggerFired={lastTriggerFiredRef.current}
          cameraPosition={devDiagnostics.cameraPosition}
          cameraLookTarget={devDiagnostics.cameraLookTarget}
          cameraYaw={devDiagnostics.cameraYaw}
          cameraPitch={devDiagnostics.cameraPitch}
          cameraDistance={devDiagnostics.cameraDistance}
          lastGameLoopBranch={devDiagnostics.lastGameLoopBranch}
          cinematicState={devDiagnostics.cinematicState}
          blockedReasons={devDiagnostics.blockedReasons}
          activeColliderSetName={devDiagnostics.activeColliderSetName}
          touchingCollider={devDiagnostics.touchingCollider}
          showColliders={showColliders}
          onToggleShowColliders={() => {
            const next = !showCollidersRef.current;
            showCollidersRef.current = next;
            setShowColliders(next);
            onTelltaleNotificationRef.current?.(next ? 'Show Colliders ON' : 'Show Colliders OFF');
          }}
          isFullbright={isFullbright}
          onToggleFullbright={() => {
            const next = !isFullbrightRef.current;
            isFullbrightRef.current = next;
            setIsFullbright(next);
            onTelltaleNotificationRef.current?.(next ? 'Fullbright ON (+2.5 Ambient, No Fog)' : 'Fullbright OFF');
          }}
          ambientIntensity={devDiagnostics.ambientIntensity}
          hemiIntensity={devDiagnostics.hemiIntensity}
          dirIntensity={devDiagnostics.dirIntensity}
          exposure={devDiagnostics.exposure}
          fogDensity={devDiagnostics.fogDensity}
          backgroundColor={devDiagnostics.backgroundColor}
          visibleLightsCount={devDiagnostics.visibleLightsCount}
          sceneVisibilities={devDiagnostics.sceneVisibilities}
          visibleRealGroupsCount={devDiagnostics.visibleRealGroupsCount}
          battlefieldVisible={devDiagnostics.battlefieldVisible}
          drawCallCount={devDiagnostics.drawCallCount}
          triangleCount={devDiagnostics.triangleCount}
          forwardVector={devDiagnostics.forwardVector}
          rightVector={devDiagnostics.rightVector}
          heldKeys={devDiagnostics.heldKeys}
          isRightInverted={devDiagnostics.isRightInverted}
        />
      )}
    </div>
  );
};
