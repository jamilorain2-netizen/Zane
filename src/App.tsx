/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ThreeCanvas } from './components/ThreeCanvas';
import { TelltaleUI } from './components/TelltaleUI';
import { InspectOverlay } from './components/InspectOverlay';
import { StartMenu } from './components/StartMenu';
import { InteractionNode, SceneLocation, GameNotification } from './types/game';
import { soundEngine } from './audio/soundEngine';
import { Volume2, VolumeX } from 'lucide-react';

export default function App() {
  const [isGameStarted, setIsGameStarted] = useState<boolean>(false);
  const [currentLocation, setCurrentLocation] = useState<SceneLocation>('bedroom');
  const [activeNode, setActiveNode] = useState<InteractionNode | null>(null);
  const [subtitle, setSubtitle] = useState<{ speaker: string; text: string }>({
    speaker: '',
    text: '',
  });
  const [notifications, setNotifications] = useState<GameNotification[]>([]);
  const [controlsUnlocked, setControlsUnlocked] = useState(false);
  const [isCinematic, setIsCinematic] = useState(true);
  const [inspectModal, setInspectModal] = useState<'drawings' | 'window' | 'holo_tv' | null>(null);
  const [isChoiceActive, setIsChoiceActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(soundEngine.getIsMuted());

  // Persistent story-state: records each cutscene by ID when it finishes or is skipped
  const [completedCutscenes, setCompletedCutscenes] = useState<Record<string, boolean>>({});

  const handleReturnToMenu = useCallback(() => {
    setIsGameStarted(false);
    setCurrentLocation('bedroom');
    setActiveNode(null);
    setSubtitle({ speaker: '', text: '' });
    setNotifications([]);
    setControlsUnlocked(false);
    setIsCinematic(true);
    setInspectModal(null);
    setIsChoiceActive(false);
    setCompletedCutscenes({});
    soundEngine.stopAllAudio();
  }, []);

  const handleStartGame = useCallback((skipIntro: boolean) => {
    setIsGameStarted(true);
  }, []);

  // Push notification with auto-dismiss (kept for internal logic)
  const addNotification = useCallback((text: string) => {
    const id = Math.random().toString(36).substring(7);
    const newNotif: GameNotification = { id, text, timestamp: Date.now() };
    setNotifications((prev) => [newNotif, ...prev.slice(0, 3)]);

    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4500);
  }, []);

  const handleSubtitleChange = useCallback((speaker: string, text: string) => {
    setSubtitle({ speaker, text });
  }, []);

  // Auto-clear subtitle after duration (3.5s - 4s) and unlock controls
  useEffect(() => {
    if (!subtitle.text) return;
    const duration = Math.max(3500, subtitle.text.length * 60);
    const timer = setTimeout(() => {
      setSubtitle({ speaker: '', text: '' });
      setControlsUnlocked(true);
      setIsCinematic(false);
    }, duration);
    return () => clearTimeout(timer);
  }, [subtitle.text]);

  // Escape key toggles Pause or closes inspect modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (inspectModal) {
          setInspectModal(null);
        } else {
          setIsPaused((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectModal]);

  const handleControlsUnlocked = useCallback(() => {
    setControlsUnlocked(true);
    setIsCinematic(false);
  }, []);

  const handleCutsceneComplete = useCallback((cutsceneId: string) => {
    setCompletedCutscenes((prev) => ({ ...prev, [cutsceneId]: true }));
    setIsCinematic(false);
    setControlsUnlocked(true);
  }, []);



  // Handle interaction click or [E] press
  const handleExecuteInteraction = useCallback(() => {
    if (!activeNode) return;
    if (activeNode.id === 'bedroom_drawings') {
      setInspectModal('drawings');
    } else if (activeNode.id === 'bedroom_window') {
      setInspectModal('window');
    } else if (activeNode.id === 'house_tv') {
      setInspectModal('holo_tv');
    }
  }, [activeNode]);

  // Custom dialogue choices state (e.g. for beer request scene)
  const [customChoices, setCustomChoices] = useState<
    { id: string; text: string; outcome: string; telltaleText: string }[] | null
  >(null);
  const [triggerCustomChoices, setTriggerCustomChoices] = useState<boolean>(false);
  const [isTimerFreeChoice, setIsTimerFreeChoice] = useState<boolean>(false);
  const [showDadRememberPopup, setShowDadRememberPopup] = useState<boolean>(false);
  const beerChoiceCallbackRef = useRef<((choice: string) => void) | null>(null);

  const handleTriggerBeerRequest = useCallback((callback?: (choice: string) => void) => {
    if (callback) {
      beerChoiceCallbackRef.current = callback;
    }
    setCustomChoices([
      {
        id: 'beer_refuse',
        text: '“Not beer again, Dad”',
        outcome: 'disobey',
        telltaleText: 'Dad will remember that.',
      },
      {
        id: 'beer_silence',
        text: '“...”',
        outcome: 'silence',
        telltaleText: 'Dad will remember that.',
      },
    ]);
    setIsTimerFreeChoice(true);
    setTriggerCustomChoices(true);
  }, []);

  const handleDialogueChoice = useCallback(
    (choiceText: string, _outcome: string, _telltaleText: string) => {
      if (customChoices && customChoices.length > 0) {
        // Store choice as beerReply
        try {
          localStorage.setItem('beerReply', choiceText);
        } catch {}

        // Show hand-drawn "Dad will remember that" popup
        setShowDadRememberPopup(true);
        setTimeout(() => {
          setShowDadRememberPopup(false);
        }, 4500);

        setCustomChoices(null);
        setTriggerCustomChoices(false);
        setIsTimerFreeChoice(false);

        if (beerChoiceCallbackRef.current) {
          beerChoiceCallbackRef.current(choiceText);
          beerChoiceCallbackRef.current = null;
        } else if ((window as any).onBeerReplyChosen) {
          (window as any).onBeerReplyChosen(choiceText);
        }
      } else {
        addNotification(_telltaleText);
        soundEngine.playTelltaleBell();
        setSubtitle({
          speaker: 'Dad (Downstairs)',
          text: '“Five minutes, Zane! Bring that wrench from the basement!”',
        });
        soundEngine.speakLine('Five minutes, Zane! Bring that wrench from the basement!', 'dad');
      }
    },
    [addNotification, customChoices]
  );

  return (
    <div className="relative w-screen h-screen bg-black text-neutral-100 flex flex-col overflow-hidden select-none font-sans">
      {!isGameStarted && (
        <StartMenu onStartGame={handleStartGame} />
      )}

      {isGameStarted && (
        <>
          {/* --- MAIN 3D VIEWPORT --- */}
          <main className="relative flex-1 w-full h-full overflow-hidden">
            <ThreeCanvas
              currentLocation={currentLocation}
              onLocationChange={(loc) => {
                setCurrentLocation(loc);
              }}
              onActiveNodeChange={setActiveNode}
              onSubtitleChange={handleSubtitleChange}
              onTelltaleNotification={addNotification}
              onControlsUnlocked={handleControlsUnlocked}
              activeInspectModal={inspectModal}
              onCloseInspect={() => setInspectModal(null)}
              isCinematicPlaying={isCinematic}
              isDialogueActive={Boolean(subtitle.text)}
              isChoiceActive={isChoiceActive}
              completedCutscenes={completedCutscenes}
              onCutsceneComplete={handleCutsceneComplete}
              isPaused={isPaused}
              onTriggerBeerRequest={handleTriggerBeerRequest}
              onReturnToMenu={handleReturnToMenu}
            />

            {/* Letterboxed dialogue subtitles, small dot crosshair, and timed choice box */}
            <TelltaleUI
              activeNode={activeNode}
              subtitle={subtitle}
              notifications={notifications}
              controlsUnlocked={controlsUnlocked}
              isCinematic={isCinematic}
              currentLocation={currentLocation}
              onExecuteInteraction={handleExecuteInteraction}
              onDialogueChoice={handleDialogueChoice}
              onDialogueChoiceStateChange={setIsChoiceActive}
              customChoices={customChoices}
              triggerCustomChoices={triggerCustomChoices}
              timerFree={isTimerFreeChoice}
              showDadRememberPopup={showDadRememberPopup}
            />

            {/* Inspection Modal for Close-Up Assets */}
            <InspectOverlay type={inspectModal} onClose={() => setInspectModal(null)} />

            {/* Minimalist Pause Overlay (ESC) */}
            {isPaused && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
                <div className="flex flex-col items-center gap-5 max-w-xs w-full mx-4 p-8 rounded-xl bg-neutral-950 border border-neutral-800 text-center shadow-2xl">
                  <div className="text-base font-semibold tracking-widest text-neutral-100 uppercase font-mono">
                    Paused
                  </div>
                  <div className="flex flex-col w-full gap-2.5">
                    <button
                      onClick={() => setIsPaused(false)}
                      className="w-full py-2.5 px-4 bg-white hover:bg-neutral-200 text-neutral-950 font-medium text-xs tracking-wider uppercase rounded-lg transition-colors cursor-pointer"
                    >
                      Resume
                    </button>
                    <button
                      onClick={() => {
                        const muted = soundEngine.toggleMute();
                        setIsMuted(muted);
                      }}
                      className="w-full py-2 px-4 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-300 text-xs font-mono rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
                    >
                      {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-neutral-300" />}
                      <span>{isMuted ? 'Unmute Audio' : 'Mute Audio'}</span>
                    </button>
                  </div>
                  <span className="text-[11px] font-mono text-neutral-500">
                    Press [ESC] to resume
                  </span>
                </div>
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}
