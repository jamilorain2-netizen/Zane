import React, { useState, useEffect } from 'react';
import { StoryState, QuestId, QuestStatus } from '../types/game';
import { getClipStatuses } from '../utils/assetLoader';

export interface DeveloperMenuProps {
  isOpen: boolean;
  onClose: () => void;
  storyState: StoryState;
  currentRoom: string;
  isImagination: boolean;
  fps: number;
  frameTimeMs: number;
  errorCount: number;
  noclip: boolean;
  onToggleNoclip: () => void;
  speedMultiplier: number;
  onChangeSpeedMultiplier: (mult: number) => void;
  onUnstick: () => void;
  onTeleport: (target: 'bedroom' | 'hallway' | 'kitchen' | 'living_room' | 'workshop' | 'restroom' | 'basement_top' | 'basement_bottom' | 'battlefield' | 'depot_start' | 'real_kitchen') => void;
  onSetQuestStatus: (questId: QuestId, status: QuestStatus) => void;
  onCompleteQuestsUpTo: (questId: QuestId) => void;
  onToggleInventory: (item: 'key' | 'flashlight' | 'wrench' | 'power' | 'photoChoice') => void;
  onForceImagination: (active: boolean) => void;
  onResetImagination: () => void;
  onTriggerCutscene: (type: 'intro' | 'hallway') => void;
  onTriggerQuietHands?: () => void;
  onResetEverything: () => void;
  onSaveSnapshot: () => void;
  onLoadSnapshot: () => void;
  isHurt?: boolean;
  onToggleHurt?: () => void;
  onTriggerFall?: () => void;
  dadState?: string;
  onChangeDadState?: (state: 'WORK' | 'WALK' | 'SIT_DOWN' | 'SIT_IDLE' | 'YELL') => void;
  sofaSeatOffset?: { x: number; y: number; z: number; rotY: number };
  onChangeSofaSeatOffset?: (offset: { x: number; y: number; z: number; rotY: number }) => void;
  worldMode?: string;
  currentLocation?: string;
  playerPosition?: string;
  lastTriggerFired?: string;
  cameraPosition?: string;
  cameraLookTarget?: string;
  cameraYaw?: number;
  cameraPitch?: number;
  cameraDistance?: number;
  lastGameLoopBranch?: string;
  cinematicState?: string;
  blockedReasons?: string[];
  activeColliderSetName?: string;
  sceneVisibilities?: Record<string, boolean>;
  visibleRealGroupsCount?: number;
  battlefieldVisible?: boolean;
  drawCallCount?: number;
  triangleCount?: number;
  showColliders?: boolean;
  onToggleShowColliders?: () => void;
  touchingCollider?: string | null;
  isFullbright?: boolean;
  onToggleFullbright?: () => void;
  ambientIntensity?: number;
  hemiIntensity?: number;
  dirIntensity?: number;
  exposure?: number;
  fogDensity?: string;
  backgroundColor?: string;
  visibleLightsCount?: number;
  heldKeys?: string[];
  computedMoveDirAndYaw?: string;
  forwardVector?: string;
  rightVector?: string;
  isRightInverted?: boolean;
  onPlayEndingCutscene?: () => void;
  animDiagnostics?: {
    zane: { currentAnimName: string; mixerTime: number; isClipLoaded: boolean };
    dad: { currentAnimName: string; mixerTime: number; isClipLoaded: boolean };
    monster: { currentAnimName: string; mixerTime: number; isClipLoaded: boolean };
  };
}

export const DeveloperMenu: React.FC<DeveloperMenuProps> = ({
  isOpen,
  onClose,
  storyState,
  currentRoom,
  isImagination,
  fps,
  frameTimeMs,
  errorCount,
  noclip,
  onToggleNoclip,
  speedMultiplier,
  onChangeSpeedMultiplier,
  onUnstick,
  onTeleport,
  onSetQuestStatus,
  onCompleteQuestsUpTo,
  onToggleInventory,
  onForceImagination,
  onResetImagination,
  onTriggerCutscene,
  onTriggerQuietHands,
  onPlayEndingCutscene,
  animDiagnostics,

  onResetEverything,
  onSaveSnapshot,
  onLoadSnapshot,
  isHurt = false,
  onToggleHurt,
  onTriggerFall,
  dadState = 'WORK',
  onChangeDadState,
  sofaSeatOffset = { x: 0, y: 0, z: 0, rotY: 0 },
  onChangeSofaSeatOffset,
  worldMode = 'real',
  currentLocation = 'bedroom',
  playerPosition = '0, 0, 0',
  lastTriggerFired = 'None',
  cameraPosition = '0.0, 0.0, 0.0',
  cameraLookTarget = '0.0, 0.0, 0.0',
  cameraYaw = 0,
  cameraPitch = 0,
  cameraDistance = 0,
  lastGameLoopBranch = 'gameplay',
  cinematicState = 'gameplay',
  blockedReasons = [],
  activeColliderSetName = 'real',
  sceneVisibilities = {},
  visibleRealGroupsCount = 1,
  battlefieldVisible = false,
  drawCallCount = 0,
  triangleCount = 0,
  showColliders = false,
  onToggleShowColliders,
  touchingCollider = 'None',
  isFullbright = false,
  onToggleFullbright,
  ambientIntensity = 0.9,
  hemiIntensity = 0.8,
  dirIntensity = 1.6,
  exposure = 1.3,
  fogDensity = '0.012',
  backgroundColor = '#0b1830',
  visibleLightsCount = 4,
  heldKeys = [],
  computedMoveDirAndYaw = 'Dir: (0.00, 0.00, 0.00) | Yaw: 0.00 rad',
  forwardVector = '(0.00, 0.00, 0.00)',
  rightVector = '(0.00, 0.00, 0.00)',
  isRightInverted = false,
}) => {
  const [activeTab, setActiveTab] = useState<'teleport' | 'quests' | 'inventory' | 'cutscenes' | 'cheats' | 'state' | 'info'>('teleport');

  // Handle number key shortcuts when menu is open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcut keys from closing or moving character while in dev menu
      if (e.key >= '1' && e.key <= '7' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tabs: Array<'teleport' | 'quests' | 'inventory' | 'cutscenes' | 'cheats' | 'state' | 'info'> = [
          'teleport',
          'quests',
          'inventory',
          'cutscenes',
          'cheats',
          'state',
          'info',
        ];
        const tabIndex = parseInt(e.key, 10) - 1;
        if (tabs[tabIndex]) {
          setActiveTab(tabs[tabIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const questList: { id: QuestId; name: string }[] = [
    { id: 'get_wrench', name: 'Get Wrench (Dad Calling)' },
    { id: 'hallway_pictures', name: 'Hallway Pictures (Straighten)' },
    { id: 'kitchen_key', name: 'Kitchen Key (Quiet Hands Minigame)' },
    { id: 'basement_wrench', name: 'Basement Wrench (Enter & Retrieve)' },
    { id: 'deliver_wrench', name: 'Deliver Wrench (Hand to Dad in Workshop)' },
    { id: 'kitchen_beer', name: 'Kitchen Beer (Fetch Dad Beer from Fridge)' },
  ];

  const getStatusBadge = (status: QuestStatus) => {
    switch (status) {
      case 'active':
        return <span className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs px-2 py-0.5 rounded font-mono">ACTIVE</span>;
      case 'completed':
        return <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs px-2 py-0.5 rounded font-mono">DONE</span>;
      default:
        return <span className="bg-neutral-800 text-neutral-400 border border-neutral-700 text-xs px-2 py-0.5 rounded font-mono">INACTIVE</span>;
    }
  };

  const nextStatus = (curr: QuestStatus): QuestStatus => {
    if (curr === 'inactive') return 'active';
    if (curr === 'active') return 'completed';
    return 'inactive';
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 select-none pointer-events-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-neutral-900/95 border border-cyan-500/40 rounded-xl shadow-2xl overflow-hidden font-sans text-neutral-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-neutral-950/90 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-mono text-sm tracking-wider uppercase font-bold text-cyan-400">
              DEVELOPER TEST TERMINAL
            </span>
            <span className="text-xs bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded">
              ?dev=1 ACTIVE
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white px-2 py-1 text-sm rounded bg-neutral-800 hover:bg-neutral-700 transition"
          >
            Close [ ` ]
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-neutral-950/60 border-b border-neutral-800 px-3 overflow-x-auto text-xs font-mono">
          {[
            { id: 'teleport', label: '1. Teleport' },
            { id: 'quests', label: '2. Quests' },
            { id: 'inventory', label: '3. Inventory' },
            { id: 'cutscenes', label: '4. Cutscenes' },
            { id: 'cheats', label: '5. Cheats' },
            { id: 'state', label: '6. State' },
            { id: 'info', label: '7. Info' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-2.5 border-b-2 font-medium transition ${
                activeTab === tab.id
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-950/30'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/30'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        <div className="p-5 max-h-[75vh] overflow-y-auto space-y-4">
          {/* TAB 1: TELEPORT */}
          {activeTab === 'teleport' && (
            <div className="space-y-3">
              <div className="text-xs text-neutral-400 uppercase font-mono tracking-wider">
                Instant Room Teleports (Safe Spawns & Auto Lighting)
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { id: 'depot_start', name: 'Depot start', desc: 'Imagination Depot Start' },
                  { id: 'real_kitchen', name: 'Back to real kitchen', desc: 'Real Kitchen Spawn' },
                  { id: 'bedroom', name: 'Bedroom', desc: 'Starting Room' },
                  { id: 'hallway', name: 'Hallway', desc: 'Main Corridor' },
                  { id: 'kitchen', name: 'Kitchen', desc: 'Key Counter Area' },
                  { id: 'living_room', name: 'Living Room', desc: 'Sofa & TV' },
                  { id: 'workshop', name: "Dad's Workshop", desc: 'Tool Room' },
                  { id: 'restroom', name: 'Restroom', desc: 'End of Hallway' },
                  { id: 'basement_top', name: 'Basement Stairs (Top)', desc: 'Stair Doorway' },
                  { id: 'basement_bottom', name: 'Basement (Bottom)', desc: 'Storage & Bench' },
                  { id: 'battlefield', name: 'Battlefield Intro', desc: 'Cyber Imagination' },
                ].map((loc) => {
                  const isGreen = loc.id === 'depot_start' || loc.id === 'real_kitchen';
                  return (
                    <button
                      key={loc.id}
                      onClick={() => {
                        onTeleport(loc.id as any);
                        onClose();
                      }}
                      className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition group ${
                        isGreen
                          ? 'bg-emerald-950/30 hover:bg-emerald-950/50 border-emerald-500/80 hover:border-emerald-400'
                          : 'bg-neutral-800/70 hover:bg-cyan-950/60 border-neutral-700/80 hover:border-cyan-500/60'
                      }`}
                    >
                      <span className={`font-semibold text-sm ${isGreen ? 'text-emerald-300 group-hover:text-emerald-200' : 'text-neutral-200 group-hover:text-cyan-300'}`}>
                        {loc.name}
                      </span>
                      <span className="text-[11px] text-neutral-400">{loc.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: QUESTS */}
          {activeTab === 'quests' && (
            <div className="space-y-4">
              <div className="text-xs text-neutral-400 uppercase font-mono tracking-wider">
                Quest Progression & Hierarchy
              </div>
              <div className="space-y-2">
                {questList.map((q) => {
                  const status = storyState.quests[q.id];
                  return (
                    <div
                      key={q.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-neutral-800/60 border border-neutral-700/60"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-sm text-neutral-200">{q.name}</span>
                        <span className="text-[11px] text-neutral-400 font-mono">ID: {q.id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onSetQuestStatus(q.id, nextStatus(status))}
                          className="hover:opacity-80 transition cursor-pointer"
                          title="Click to cycle status"
                        >
                          {getStatusBadge(status)}
                        </button>
                        <button
                          onClick={() => onCompleteQuestsUpTo(q.id)}
                          className="text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-200 px-2.5 py-1 rounded transition font-mono"
                        >
                          Set Up To Here
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: INVENTORY */}
          {activeTab === 'inventory' && (
            <div className="space-y-3">
              <div className="text-xs text-neutral-400 uppercase font-mono tracking-wider">
                Interactive Items & Story Props
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => onToggleInventory('key')}
                  className={`flex items-center justify-between p-3 rounded-lg border text-left transition ${
                    storyState.hasKey
                      ? 'bg-amber-950/40 border-amber-500/60 text-amber-300'
                      : 'bg-neutral-800/50 border-neutral-700 text-neutral-400'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-sm">Basement Key</div>
                    <div className="text-[11px] opacity-80">Unlocks basement door</div>
                  </div>
                  <span className="text-xs font-mono font-bold">{storyState.hasKey ? 'IN BAG' : 'EMPTY'}</span>
                </button>



                <button
                  onClick={() => onToggleInventory('wrench')}
                  className={`flex items-center justify-between p-3 rounded-lg border text-left transition ${
                    storyState.hasWrench
                      ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-300'
                      : 'bg-neutral-800/50 border-neutral-700 text-neutral-400'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-sm">Mechanic Wrench</div>
                    <div className="text-[11px] opacity-80">Primary Quest Target</div>
                  </div>
                  <span className="text-xs font-mono font-bold">{storyState.hasWrench ? 'IN BAG' : 'EMPTY'}</span>
                </button>

                <button
                  onClick={() => onToggleInventory('power')}
                  className="flex items-center justify-between p-3 rounded-lg border bg-neutral-800/50 border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition"
                >
                  <div>
                    <div className="font-semibold text-sm">Basement Power</div>
                    <div className="text-[11px] text-neutral-400">Restore Breaker Power</div>
                  </div>
                  <span className="text-xs font-mono text-cyan-400 font-bold">{storyState.hasPower ? 'RESTORED' : 'OFF'}</span>
                </button>

                <button
                  onClick={() => onToggleInventory('photoChoice')}
                  className="col-span-2 flex items-center justify-between p-3 rounded-lg border bg-neutral-800/50 border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition"
                >
                  <div>
                    <div className="font-semibold text-sm">Old Family Photo Choice</div>
                    <div className="text-[11px] text-neutral-400">Current Value: {storyState.photoChoice || 'Not Made'}</div>
                  </div>
                  <span className="text-xs font-mono bg-neutral-700 px-2.5 py-1 rounded text-cyan-300 font-bold">
                    CYCLE CHOICE
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: CUTSCENES & IMAGINATION */}
          {activeTab === 'cutscenes' && (
            <div className="space-y-3">
              <div className="text-xs text-neutral-400 uppercase font-mono tracking-wider">
                Sequences & Imagination Layer
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    onTriggerCutscene('intro');
                    onClose();
                  }}
                  className="p-3 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700 text-left transition"
                >
                  <div className="font-semibold text-sm text-neutral-200">Play Intro Cutscene</div>
                  <div className="text-[11px] text-neutral-400">Battlefield camera & narration</div>
                </button>



                <button
                  onClick={() => {
                    onTriggerCutscene('hallway');
                    onClose();
                  }}
                  className="p-3 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700 text-left transition"
                >
                  <div className="font-semibold text-sm text-neutral-200">Trigger Hallway Imagination</div>
                  <div className="text-[11px] text-neutral-400">Crooked frame dialogue & cyber shift</div>
                </button>

                <button
                  onClick={() => onForceImagination(!isImagination)}
                  className={`p-3 rounded-lg border text-left transition ${
                    isImagination
                      ? 'bg-cyan-950/50 border-cyan-500/60 text-cyan-300'
                      : 'bg-neutral-800/60 border-neutral-700 text-neutral-300'
                  }`}
                >
                  <div className="font-semibold text-sm">Force Imagination Mode</div>
                  <div className="text-[11px] opacity-80">{isImagination ? 'State: ON' : 'State: OFF'}</div>
                </button>

                <button
                  onClick={() => {
                    onTriggerQuietHands?.();
                    onClose();
                  }}
                  className="col-span-2 p-3 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-amber-600/60 text-left transition text-amber-300"
                >
                  <div className="font-semibold text-sm">Launch "Quiet Hands" Minigame</div>
                  <div className="text-[11px] text-neutral-400">Open kitchen drawer stealth retrieval overlay</div>
                </button>

                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('beerRequest'));
                    onClose();
                  }}
                  className="col-span-2 p-3 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-red-500/60 text-left transition text-red-300"
                >
                  <div className="font-semibold text-sm">Play Dad "Beer Request" Scene (beerRequest)</div>
                  <div className="text-[11px] text-neutral-400">TV murmur, timer-free choices, Dad shouts disobedience, heavy dread atmosphere</div>
                </button>

                <button
                  onClick={() => {
                    onPlayEndingCutscene?.();
                    onClose();
                  }}
                  className="col-span-2 p-3 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-purple-500/60 text-left transition text-purple-300"
                >
                  <div className="font-semibold text-sm">Play ending cutscene</div>
                  <div className="text-[11px] text-neutral-400">Starts the beer cutscene from phase 1 directly (no depot)</div>
                </button>


                <button
                  onClick={onResetImagination}
                  className="col-span-2 p-3 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700 text-left transition text-amber-300"
                >
                  <div className="font-semibold text-sm">Reset Imagination (Return to Normal Real World)</div>
                  <div className="text-[11px] text-neutral-400">Restores warm home lighting and real world geometry</div>
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: PLAYER CHEATS & ANIMATIONS */}
          {activeTab === 'cheats' && (
            <div className="space-y-4">
              <div className="text-xs text-neutral-400 uppercase font-mono tracking-wider">
                Movement & Physics Modifiers
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={onToggleNoclip}
                  className={`p-3 rounded-lg border text-left transition ${
                    noclip
                      ? 'bg-purple-950/50 border-purple-500/60 text-purple-300'
                      : 'bg-neutral-800/60 border-neutral-700 text-neutral-300'
                  }`}
                >
                  <div className="font-semibold text-sm">Noclip Mode (Fly)</div>
                  <div className="text-[11px] opacity-80">
                    {noclip ? 'ON (Use [Q] Down / [E] Up)' : 'OFF (Normal Collision)'}
                  </div>
                </button>

                <button
                  onClick={onToggleShowColliders}
                  className={`p-3 rounded-lg border text-left transition ${
                    showColliders
                      ? 'bg-cyan-950/50 border-cyan-500/60 text-cyan-300'
                      : 'bg-neutral-800/60 border-neutral-700 text-neutral-300'
                  }`}
                >
                  <div className="font-semibold text-sm">Show colliders</div>
                  <div className="text-[11px] opacity-80">
                    {showColliders ? 'ON (Translucent boxes active)' : 'OFF (Hidden)'}
                  </div>
                </button>

                <button
                  onClick={onToggleFullbright}
                  className={`p-3 rounded-lg border text-left transition ${
                    isFullbright
                      ? 'bg-amber-950/50 border-amber-500/60 text-amber-300'
                      : 'bg-neutral-800/60 border-neutral-700 text-neutral-300'
                  }`}
                >
                  <div className="font-semibold text-sm">Fullbright [L]</div>
                  <div className="text-[11px] opacity-80">
                    {isFullbright ? 'ON (Boost 2.5, No Fog)' : 'OFF (Normal Lighting)'}
                  </div>
                </button>

                <button
                  onClick={() => {
                    const nextMult = speedMultiplier === 1 ? 2 : speedMultiplier === 2 ? 4 : 1;
                    onChangeSpeedMultiplier(nextMult);
                  }}
                  className="p-3 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700 text-left transition"
                >
                  <div className="font-semibold text-sm text-neutral-200">Speed Multiplier</div>
                  <div className="text-[11px] text-cyan-400 font-mono font-bold">Current: {speedMultiplier}x Speed</div>
                </button>

                <button
                  onClick={() => {
                    onUnstick();
                    onClose();
                  }}
                  className="col-span-2 p-3 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700 text-left transition text-emerald-300"
                >
                  <div className="font-semibold text-sm">Unstick Player</div>
                  <div className="text-[11px] text-neutral-400">Teleports back to the last safe grounded position</div>
                </button>
              </div>

              <div className="text-xs text-neutral-400 uppercase font-mono tracking-wider pt-2 border-t border-neutral-800">
                Zane Animation & Hurt State
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={onToggleHurt}
                  className={`p-3 rounded-lg border text-left transition ${
                    isHurt
                      ? 'bg-rose-950/60 border-rose-500/80 text-rose-300'
                      : 'bg-neutral-800/60 border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  <div className="font-semibold text-sm">Zane Hurt State</div>
                  <div className="text-[11px] opacity-80">
                    {isHurt ? 'ACTIVE: 50% Speed + Limp + INJURED_WALK' : 'NORMAL: Full Speed'}
                  </div>
                </button>

                <button
                  onClick={onTriggerFall}
                  className="p-3 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700 text-left transition text-amber-300"
                >
                  <div className="font-semibold text-sm">Trigger FALL Animation</div>
                  <div className="text-[11px] text-neutral-400">Plays ty_fall once & holds lying down</div>
                </button>
              </div>

              <div className="text-xs text-neutral-400 uppercase font-mono tracking-wider pt-2 border-t border-neutral-800">
                Dad Animation States (Current: <span className="text-cyan-400 font-bold">{dadState || 'WORK'}</span>)
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['WORK', 'WALK', 'SIT_DOWN', 'SIT_IDLE', 'YELL'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => onChangeDadState?.(st)}
                    className={`p-2.5 rounded-lg border text-center font-mono text-xs font-semibold transition ${
                      dadState === st
                        ? 'bg-cyan-950 border-cyan-400 text-cyan-300'
                        : 'bg-neutral-800/70 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Requirement 3: Dev-menu controls with sliders "Sofa seat offset X, Y, Z and rotation" */}
              <div className="text-xs text-neutral-400 uppercase font-mono tracking-wider pt-2 border-t border-neutral-800 flex justify-between items-center">
                <span>Sofa Seat Offset Tuning</span>
                <button
                  onClick={() => {
                    const reset = { x: 0, y: 0, z: 0, rotY: 0 };
                    onChangeSofaSeatOffset?.(reset);
                    console.log('[Sofa Seat Offset] Reset to defaults -> X: 0.000, Y: 0.000, Z: 0.000, Rotation: 0.000 rad (0.0°)');
                  }}
                  className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 text-neutral-400 hover:text-white transition"
                >
                  Reset
                </button>
              </div>
              <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 space-y-2.5 font-mono text-xs">
                {/* Offset X Slider */}
                <div>
                  <div className="flex justify-between text-neutral-400 mb-1">
                    <span>Sofa seat offset X:</span>
                    <span className="text-amber-400 font-bold">{(sofaSeatOffset?.x ?? 0).toFixed(3)} m</span>
                  </div>
                  <input
                    type="range"
                    min="-1.5"
                    max="1.5"
                    step="0.01"
                    value={sofaSeatOffset?.x ?? 0}
                    onChange={(e) => {
                      const newOffset = {
                        ...(sofaSeatOffset ?? { x: 0, y: 0, z: 0, rotY: 0 }),
                        x: parseFloat(e.target.value),
                      };
                      onChangeSofaSeatOffset?.(newOffset);
                      console.log(`[Sofa Seat Offset] Final numbers -> X: ${newOffset.x.toFixed(3)}, Y: ${newOffset.y.toFixed(3)}, Z: ${newOffset.z.toFixed(3)}, Rotation: ${newOffset.rotY.toFixed(3)} rad (${((newOffset.rotY * 180) / Math.PI).toFixed(1)}°)`);
                    }}
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                  />
                </div>

                {/* Offset Y Slider */}
                <div>
                  <div className="flex justify-between text-neutral-400 mb-1">
                    <span>Sofa seat offset Y:</span>
                    <span className="text-amber-400 font-bold">{(sofaSeatOffset?.y ?? 0).toFixed(3)} m</span>
                  </div>
                  <input
                    type="range"
                    min="-1.0"
                    max="1.0"
                    step="0.01"
                    value={sofaSeatOffset?.y ?? 0}
                    onChange={(e) => {
                      const newOffset = {
                        ...(sofaSeatOffset ?? { x: 0, y: 0, z: 0, rotY: 0 }),
                        y: parseFloat(e.target.value),
                      };
                      onChangeSofaSeatOffset?.(newOffset);
                      console.log(`[Sofa Seat Offset] Final numbers -> X: ${newOffset.x.toFixed(3)}, Y: ${newOffset.y.toFixed(3)}, Z: ${newOffset.z.toFixed(3)}, Rotation: ${newOffset.rotY.toFixed(3)} rad (${((newOffset.rotY * 180) / Math.PI).toFixed(1)}°)`);
                    }}
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                  />
                </div>

                {/* Offset Z Slider */}
                <div>
                  <div className="flex justify-between text-neutral-400 mb-1">
                    <span>Sofa seat offset Z:</span>
                    <span className="text-amber-400 font-bold">{(sofaSeatOffset?.z ?? 0).toFixed(3)} m</span>
                  </div>
                  <input
                    type="range"
                    min="-1.5"
                    max="1.5"
                    step="0.01"
                    value={sofaSeatOffset?.z ?? 0}
                    onChange={(e) => {
                      const newOffset = {
                        ...(sofaSeatOffset ?? { x: 0, y: 0, z: 0, rotY: 0 }),
                        z: parseFloat(e.target.value),
                      };
                      onChangeSofaSeatOffset?.(newOffset);
                      console.log(`[Sofa Seat Offset] Final numbers -> X: ${newOffset.x.toFixed(3)}, Y: ${newOffset.y.toFixed(3)}, Z: ${newOffset.z.toFixed(3)}, Rotation: ${newOffset.rotY.toFixed(3)} rad (${((newOffset.rotY * 180) / Math.PI).toFixed(1)}°)`);
                    }}
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                  />
                </div>

                {/* Rotation Slider */}
                <div>
                  <div className="flex justify-between text-neutral-400 mb-1">
                    <span>Sofa seat offset Rotation:</span>
                    <span className="text-amber-400 font-bold">
                      {(((sofaSeatOffset?.rotY ?? 0) * 180) / Math.PI).toFixed(1)}° ({(sofaSeatOffset?.rotY ?? 0).toFixed(3)} rad)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-Math.PI}
                    max={Math.PI}
                    step="0.02"
                    value={sofaSeatOffset?.rotY ?? 0}
                    onChange={(e) => {
                      const newOffset = {
                        ...(sofaSeatOffset ?? { x: 0, y: 0, z: 0, rotY: 0 }),
                        rotY: parseFloat(e.target.value),
                      };
                      onChangeSofaSeatOffset?.(newOffset);
                      console.log(`[Sofa Seat Offset] Final numbers -> X: ${newOffset.x.toFixed(3)}, Y: ${newOffset.y.toFixed(3)}, Z: ${newOffset.z.toFixed(3)}, Rotation: ${newOffset.rotY.toFixed(3)} rad (${((newOffset.rotY * 180) / Math.PI).toFixed(1)}°)`);
                    }}
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                  />
                </div>
              </div>

              {/* Dad Character Model & Animation Files Load Status (Green or Red per file) */}
              <div className="text-xs text-neutral-400 uppercase font-mono tracking-wider pt-2 border-t border-neutral-800">
                Dad Character Assets Load Status
              </div>
              <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 space-y-1.5 font-mono text-xs">
                {['dad_walk', 'dad_sitdown', 'dad_sitidle', 'dad_yell', 'dad_work'].map((f) => {
                  const info = getClipStatuses()[f];
                  const isLoaded = info?.status === 'loaded';
                  const isFailed = info?.status === 'failed';
                  return (
                    <div key={f} className="flex justify-between items-center py-0.5">
                      <span className="text-neutral-300 font-semibold">{f}</span>
                      <div className="flex items-center gap-2">
                        {info?.resolvedFile && (
                          <span className="text-[10px] text-neutral-500 max-w-[200px] truncate">
                            {info.resolvedFile}
                          </span>
                        )}
                        {isLoaded ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/70">
                            LOADED
                          </span>
                        ) : isFailed ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-500/70">
                            FAILED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-500/70">
                            LOADING...
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 6: STATE MANAGEMENT */}
          {activeTab === 'state' && (
            <div className="space-y-3">
              <div className="text-xs text-neutral-400 uppercase font-mono tracking-wider">
                Snapshot & Game Memory
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={onSaveSnapshot}
                  className="p-3 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700 text-left transition"
                >
                  <div className="font-semibold text-sm text-cyan-300">Save Snapshot</div>
                  <div className="text-[11px] text-neutral-400">Save story state and position in memory</div>
                </button>

                <button
                  onClick={onLoadSnapshot}
                  className="p-3 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700 text-left transition"
                >
                  <div className="font-semibold text-sm text-amber-300">Load Snapshot</div>
                  <div className="text-[11px] text-neutral-400">Restore saved story state and position</div>
                </button>

                <button
                  onClick={onResetEverything}
                  className="col-span-2 p-3 rounded-lg bg-red-950/30 hover:bg-red-950/60 border border-red-500/40 text-left transition text-red-300"
                >
                  <div className="font-semibold text-sm">Reset Everything</div>
                  <div className="text-[11px] text-red-400">Reset all story state, inventory, quests, and respawn in bedroom</div>
                </button>
              </div>
            </div>
          )}

          {/* TAB 7: LIVE DIAGNOSTICS & INFO */}
          {activeTab === 'info' && (
            <div className="space-y-3 font-mono text-xs">
              <div className="text-neutral-400 uppercase tracking-wider">Live Diagnostics</div>
              <div className="grid grid-cols-2 gap-2 bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                <div>
                  <span className="text-neutral-500">World Mode:</span>{' '}
                  <span className={worldMode === 'imagination' ? 'text-amber-400 font-bold' : 'text-cyan-400 font-bold'}>{worldMode}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Current Location:</span>{' '}
                  <span className="text-cyan-400 font-bold">{currentLocation}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Current Room:</span>{' '}
                  <span className="text-cyan-400 font-bold">{currentRoom}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Imagination:</span>{' '}
                  <span className={isImagination ? 'text-amber-400 font-bold' : 'text-neutral-400'}>
                    {isImagination ? 'ACTIVE' : 'OFF'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-neutral-500">Player Position:</span>{' '}
                  <span className="text-emerald-400 font-bold">({playerPosition})</span>
                </div>
                <div className="col-span-2">
                  <span className="text-neutral-500">Last Trigger Fired:</span>{' '}
                  <span className="text-yellow-400 font-bold">{lastTriggerFired}</span>
                </div>
                <div>
                  <span className="text-neutral-500">FPS / Frame Time:</span>{' '}
                  <span className="text-emerald-400 font-bold">{fps} FPS ({frameTimeMs.toFixed(1)}ms)</span>
                </div>
                <div>
                  <span className="text-neutral-500">Console Errors:</span>{' '}
                  <span className={errorCount > 0 ? 'text-red-400 font-bold' : 'text-neutral-400'}>
                    {errorCount}
                  </span>
                </div>
              </div>

              {/* Camera & Loop Diagnostics */}
              <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 space-y-2">
                <div className="text-neutral-400 font-semibold mb-1">Camera & Control Diagnostics:</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-neutral-500">Cam Pos:</span>{' '}
                    <span className={((cameraPosition?.split(',')[1] ? parseFloat(cameraPosition.split(',')[1]) : 0) < 0) ? 'text-red-400 font-bold underline' : 'text-cyan-300 font-mono'}>({cameraPosition})</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Cam Target:</span>{' '}
                    <span className="text-cyan-300 font-mono">({cameraLookTarget})</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Yaw / Pitch:</span>{' '}
                    <span className="text-cyan-300 font-mono">{cameraYaw.toFixed(2)}, {cameraPitch.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Cam Distance:</span>{' '}
                    <span className="text-cyan-300 font-mono">{cameraDistance.toFixed(1)}u</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Last Loop Branch:</span>{' '}
                    <span className="text-amber-400 font-bold">{lastGameLoopBranch}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Cinematic State:</span>{' '}
                    <span className="text-purple-400 font-bold">{cinematicState}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-neutral-500">Controls Blocked Because:</span>{' '}
                    <span className={blockedReasons && blockedReasons.length > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                      {blockedReasons && blockedReasons.length > 0 ? blockedReasons.join(', ') : 'None (Gameplay Active)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Active Colliders:</span>{' '}
                    <span className="text-cyan-400 font-bold">{activeColliderSetName}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Touching collider:</span>{' '}
                    <span className={touchingCollider && touchingCollider !== 'None' ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                      {touchingCollider || 'None'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-neutral-500">Draw Calls / Tris:</span>{' '}
                    <span className="text-emerald-400 font-bold">{drawCallCount} / {triangleCount.toLocaleString()}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-neutral-500">Camera Vectors & Keys:</span>{' '}
                    <span className="text-cyan-300 font-mono text-xs block mt-0.5">
                      Fwd: {forwardVector} | Right: {rightVector} | Keys: {heldKeys && heldKeys.length > 0 ? heldKeys.join(', ') : 'None'}
                    </span>
                  </div>
                  {isRightInverted && (
                    <div className="col-span-2 text-red-400 font-bold font-mono text-xs bg-red-950/40 p-1.5 rounded border border-red-500/60 animate-pulse mt-1">
                      RIGHT VECTOR INVERTED
                    </div>
                  )}
                  <div className="col-span-2">
                    <span className="text-neutral-500">Move Dir & Yaw:</span>{' '}
                    <span className="text-cyan-300 font-mono font-bold">
                      {computedMoveDirAndYaw || 'Dir: (0.00, 0.00, 0.00) | Yaw: 0.00 rad'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Scene Visibilities & Leak Check */}
              <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-neutral-400 font-semibold">Scene Groups Visibility:</span>
                  <span className={battlefieldVisible && visibleRealGroupsCount > 0 ? 'text-red-400 font-bold animate-pulse' : 'text-emerald-400 font-bold'}>
                    {battlefieldVisible && visibleRealGroupsCount > 0 ? '⚠ WORLD LEAK DETECTED!' : 'Clean'}
                  </span>
                </div>
                {sceneVisibilities && Object.entries(sceneVisibilities).map(([name, vis]) => (
                  <div key={name} className="flex justify-between items-center font-mono text-xs py-0.5">
                    <span className="text-neutral-300 capitalize">{name}</span>
                    <span className={vis ? 'text-amber-400 font-bold' : 'text-neutral-500'}>
                      {vis ? 'VISIBLE (true)' : 'HIDDEN (false)'}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between pt-1 border-t border-neutral-800 text-[11px]">
                  <span className="text-neutral-400">Visible Real Groups Count:</span>
                  <span className={visibleRealGroupsCount > 0 ? 'text-cyan-400 font-bold' : 'text-neutral-500'}>{visibleRealGroupsCount}</span>
                </div>
              </div>

              {/* Lighting & Exposure Diagnostics */}
              <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-neutral-400 font-semibold">Lighting & Exposure Diagnostics:</span>
                  <span className={isFullbright ? 'text-amber-400 font-bold' : 'text-cyan-400 font-bold'}>
                    {isFullbright ? 'FULLBRIGHT ACTIVE' : 'Normal'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-neutral-500">Ambient Intensity:</span>{' '}
                    <span className="text-cyan-300 font-bold">{ambientIntensity.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Hemi Intensity:</span>{' '}
                    <span className="text-cyan-300 font-bold">{hemiIntensity.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Directional Intensity:</span>{' '}
                    <span className="text-cyan-300 font-bold">{dirIntensity.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Exposure:</span>{' '}
                    <span className="text-emerald-400 font-bold">{exposure.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Fog Density:</span>{' '}
                    <span className="text-cyan-300 font-bold">{fogDensity}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Background Color:</span>{' '}
                    <span className="text-cyan-300 font-bold">{backgroundColor}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-neutral-500">Visible Lights:</span>{' '}
                    <span className="text-emerald-400 font-bold">{visibleLightsCount}</span>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 space-y-1">
                <div className="text-neutral-400 font-semibold mb-1">Quest States:</div>
                {Object.entries(storyState.quests).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-neutral-400">{k}:</span>
                    <span className={v === 'completed' ? 'text-emerald-400' : v === 'active' ? 'text-amber-400' : 'text-neutral-500'}>
                      {v}
                    </span>
                  </div>
                ))}
              </div>

              {/* Character & Monster Active Animation Diagnostics */}
              <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 space-y-2.5 font-mono text-xs">
                <div className="text-neutral-400 font-semibold uppercase tracking-wider text-[11px] flex justify-between items-center">
                  <span>Character & Monster Animation Diagnostics:</span>
                  <span className="text-[10px] text-cyan-400 font-normal">Live Animation State</span>
                </div>

                {/* Zane Diagnostics */}
                <div className="p-2 rounded bg-neutral-900/60 border border-neutral-800 space-y-1">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-cyan-300">Zane (Player)</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${animDiagnostics?.zane.isClipLoaded ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/60' : 'bg-rose-950 text-rose-400 border border-rose-500/60'}`}>
                      {animDiagnostics?.zane.isClipLoaded ? 'CLIP LOADED' : 'NOT LOADED'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-neutral-400">Current Animation:</span>
                    <span className="text-amber-400 font-semibold">{animDiagnostics?.zane.currentAnimName || 'IDLE'}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-neutral-400">Mixer Time:</span>
                    <span className="text-cyan-400 font-semibold">{(animDiagnostics?.zane.mixerTime ?? 0).toFixed(2)}s</span>
                  </div>
                </div>

                {/* Dad Diagnostics */}
                <div className="p-2 rounded bg-neutral-900/60 border border-neutral-800 space-y-1">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-amber-300">Dad</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${animDiagnostics?.dad.isClipLoaded ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/60' : 'bg-rose-950 text-rose-400 border border-rose-500/60'}`}>
                      {animDiagnostics?.dad.isClipLoaded ? 'CLIP LOADED' : 'NOT LOADED'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-neutral-400">Current Animation:</span>
                    <span className="text-amber-400 font-semibold">{animDiagnostics?.dad.currentAnimName || 'WORK'}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-neutral-400">Mixer Time:</span>
                    <span className="text-cyan-400 font-semibold">{(animDiagnostics?.dad.mixerTime ?? 0).toFixed(2)}s</span>
                  </div>
                </div>

                {/* Monster Diagnostics */}
                <div className="p-2 rounded bg-neutral-900/60 border border-neutral-800 space-y-1">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-red-400">Monster (Monster Dad)</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${animDiagnostics?.monster.isClipLoaded ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/60' : 'bg-amber-950 text-amber-400 border border-amber-500/60'}`}>
                      {animDiagnostics?.monster.isClipLoaded ? 'CLIP LOADED' : 'PROCEDURAL / FALLBACK'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-neutral-400">Current Animation:</span>
                    <span className="text-red-400 font-semibold">{animDiagnostics?.monster.currentAnimName || 'none'}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-neutral-400">Mixer Time:</span>
                    <span className="text-cyan-400 font-semibold">{(animDiagnostics?.monster.mixerTime ?? 0).toFixed(2)}s</span>
                  </div>
                </div>
              </div>

              {/* Monster Model Files Load Status (Green or Red per file) */}
              <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 space-y-1.5 font-mono text-xs">
                <div className="text-neutral-400 font-semibold mb-1 uppercase tracking-wider text-[11px] flex justify-between items-center">
                  <span>Monster Model Files Load Status:</span>
                  <span className="text-[10px] text-neutral-500 font-normal">Battlefield / Depot</span>
                </div>
                {['monster_walk', 'monster_run', 'monster_roar', 'monster_attack'].map((f) => {
                  const info = getClipStatuses()[f];
                  const isLoaded = info?.status === 'loaded';
                  const isFailed = info?.status === 'failed' || (!isLoaded && info?.status !== 'loading');
                  return (
                    <div key={f} className="flex justify-between items-center py-0.5">
                      <span className="text-neutral-300 font-semibold">{f}</span>
                      <div className="flex items-center gap-2">
                        {info?.resolvedFile && (
                          <span className="text-[10px] text-neutral-500 max-w-[180px] truncate">
                            {info.resolvedFile}
                          </span>
                        )}
                        {isLoaded ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/70">
                            LOADED
                          </span>
                        ) : isFailed ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-500/70">
                            FAILED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-500/70">
                            LOADING...
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 space-y-1.5">
                <div className="text-neutral-400 font-semibold mb-1">Animation Clips & 3D Assets Load Status:</div>
                {Object.entries(getClipStatuses()).map(([clipName, info]) => (
                  <div key={clipName} className="flex justify-between items-center text-[11px] py-0.5">
                    <span className="text-neutral-300 font-medium">{clipName}</span>
                    <div className="flex items-center gap-1.5 font-mono">
                      {info.resolvedFile && <span className="text-neutral-500 text-[10px] max-w-[180px] truncate">{info.resolvedFile}</span>}
                      {info.status === 'loaded' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/70">LOADED</span>
                      ) : info.status === 'loading' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-500/70">LOADING...</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-500/70">FAILED</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-neutral-950 border-t border-neutral-800 flex justify-between items-center text-[11px] text-neutral-400 font-mono">
          <span>Press [1 - 7] to switch tabs</span>
          <span>Press [ ` ] or ESC to close</span>
        </div>
      </div>
    </div>
  );
};
