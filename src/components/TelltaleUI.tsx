import React, { useState, useEffect } from 'react';
import { InteractionNode, GameNotification, SceneLocation } from '../types/game';
import { SkipForward } from 'lucide-react';

interface TelltaleUIProps {
  activeNode: InteractionNode | null;
  subtitle: { speaker: string; text: string; isJaggedShaking?: boolean };
  notifications: GameNotification[];
  controlsUnlocked: boolean;
  isCinematic: boolean;
  currentLocation: SceneLocation;
  onExecuteInteraction: () => void;
  onDialogueChoice: (choiceText: string, outcome: string, telltaleText: string) => void;
  onDialogueChoiceStateChange?: (active: boolean) => void;
  customChoices?: Array<{ id: string; text: string; outcome: string; telltaleText: string }> | null;
  triggerCustomChoices?: boolean;
  timerFree?: boolean;
  showDadRememberPopup?: boolean;
}

// Rough crayon-outlined rounded button for choice options
const CrayonChoiceOption: React.FC<{
  numberLabel: string;
  text: string;
  onClick: () => void;
}> = ({ numberLabel, text, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-full text-left p-3 sm:p-3.5 flex items-center gap-3 transition-all duration-150 cursor-pointer focus:outline-none hover:scale-[1.015] active:scale-[0.985]"
    >
      {/* Hand-drawn rough crayon rounded border and fill */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none overflow-visible drop-shadow-[0_2px_5px_rgba(0,0,0,0.85)]"
        viewBox="0 0 280 56"
        preserveAspectRatio="none"
        fill="none"
      >
        {/* Soft dark chalky backdrop */}
        <rect
          x="3"
          y="3"
          width="274"
          height="50"
          rx="12"
          ry="12"
          fill="#111113"
          fillOpacity="0.9"
        />
        {/* Primary sketchy crayon stroke */}
        <path
          d="M 14 3 C 70 2.2, 210 3.8, 266 3 C 274 3, 277 8, 277 15 C 276.5 28, 277.5 40, 277 47 C 277 53, 272 53, 264 53 C 200 53.8, 80 52.2, 14 53 C 6 53, 3 48, 3 41 C 3.5 28, 2.5 16, 3 9 C 3 3, 8 3, 14 3 Z"
          stroke="#ffffff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="group-hover:stroke-yellow-300 transition-colors duration-200"
        />
        {/* Secondary imperfect sketch stroke */}
        <path
          d="M 15 4.5 C 72 4, 208 5, 264 4.5 C 271 4.5, 275 9, 275.5 16 C 275 29, 276 39, 275.5 45.5 C 275.5 51, 270 51.5, 262 51.5 C 198 52, 78 51, 15 51.5 C 8 51.5, 4.5 47, 4.5 40 C 5 27, 4 15, 4.5 9.5 C 4.5 5, 9 4.5, 15 4.5"
          stroke="rgba(255, 255, 255, 0.45)"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeDasharray="24 4"
          className="group-hover:stroke-yellow-200/60 transition-colors duration-200"
        />
      </svg>

      {/* Number Badge with hand-drawn circle */}
      <div className="relative z-10 w-6 h-6 shrink-0 flex items-center justify-center">
        <svg
          className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="#ffffff"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="group-hover:stroke-yellow-300 transition-colors"
          />
        </svg>
        <span
          className="font-crayon font-bold text-sm text-neutral-100 group-hover:text-yellow-200"
          style={{
            textShadow: '0 1px 3px rgba(0,0,0,0.9)',
          }}
        >
          {numberLabel}
        </span>
      </div>

      {/* Option Text in white handwritten font with soft dark outline */}
      <span
        className="relative z-10 font-crayon text-sm sm:text-base font-normal text-white group-hover:text-yellow-100 transition-colors leading-snug drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
        style={{
          textShadow:
            '0 2px 4px rgba(0,0,0,0.95), -1px -1px 0 rgba(0,0,0,0.85), 1px -1px 0 rgba(0,0,0,0.85), -1px 1px 0 rgba(0,0,0,0.85), 1px 1px 0 rgba(0,0,0,0.85)',
        }}
      >
        {text}
      </span>
    </button>
  );
};

export const TelltaleUI: React.FC<TelltaleUIProps> = ({
  subtitle,
  notifications,
  isCinematic,
  currentLocation,
  onDialogueChoice,
  onDialogueChoiceStateChange,
  customChoices,
  triggerCustomChoices,
  timerFree = false,
  showDadRememberPopup = false,
}) => {
  const [dialogueChoicesVisible, setDialogueChoicesVisible] = useState(false);
  const [dialogueTimer, setDialogueTimer] = useState(100);
  const hasPromptedBedroomChoicesRef = React.useRef(false);

  // Trigger dialogue choice prompt once after Dad shouts and pause elapses
  useEffect(() => {
    if (!isCinematic && currentLocation === 'bedroom' && !hasPromptedBedroomChoicesRef.current) {
      hasPromptedBedroomChoicesRef.current = true;
      const timer = setTimeout(() => {
        setDialogueChoicesVisible(true);
        onDialogueChoiceStateChange?.(true);
      }, 4800);
      return () => clearTimeout(timer);
    }
  }, [isCinematic, currentLocation, onDialogueChoiceStateChange]);

  useEffect(() => {
    if (triggerCustomChoices && customChoices) {
      setDialogueChoicesVisible(true);
      onDialogueChoiceStateChange?.(true);
    }
  }, [triggerCustomChoices, customChoices, onDialogueChoiceStateChange]);

  // Dialogue timer countdown - disabled when timerFree is true
  useEffect(() => {
    if (!dialogueChoicesVisible) return;
    if (timerFree) {
      setDialogueTimer(100);
      return;
    }
    setDialogueTimer(100);
    let currentTimer = 100;

    const interval = setInterval(() => {
      currentTimer -= 1.25;
      if (currentTimer <= 0) {
        clearInterval(interval);
        setDialogueChoicesVisible(false);
        onDialogueChoiceStateChange?.(false);
        setDialogueTimer(0);
        onDialogueChoice(
          '[Silence]',
          'Zane remained silent, staring at his plastic blasters.',
          'Dad noticed your silence.'
        );
      } else {
        setDialogueTimer(currentTimer);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [dialogueChoicesVisible, timerFree, onDialogueChoice, onDialogueChoiceStateChange]);

  // Is this subtitle a loud angry shout?
  const isShoutSubtitle = Boolean(
    subtitle.isJaggedShaking ||
      subtitle.text.includes('disobeying me') ||
      subtitle.text.includes('ZANE!!!')
  );

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between z-30 select-none overflow-hidden font-crayon">
      {/* --- TOP NOTIFICATIONS & HAND-DRAWN "DAD WILL REMEMBER THAT" POPUP --- */}
      <div className="absolute top-6 left-6 z-50 flex flex-col gap-2.5 pointer-events-none">
        {/* Hand-drawn "Dad will remember that" popup */}
        {showDadRememberPopup && (
          <div className="animate-in fade-in slide-in-from-top-4 duration-400">
            <div
              className="relative px-5 py-3 rounded-md shadow-2xl flex items-center gap-3 transform -rotate-1 select-none"
              style={{
                backgroundColor: '#fefce8',
                border: '2px solid #78350f',
                boxShadow: '0 8px 24px rgba(0,0,0,0.65), 2px 3px 0 rgba(120,53,15,0.4)',
              }}
            >
              {/* Hand-drawn crayon eye/quill marker icon */}
              <svg className="w-5 h-5 text-amber-900 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" fill="#92400e" />
              </svg>
              <div className="flex flex-col">
                <span className="font-crayon font-bold text-base sm:text-lg text-amber-950 tracking-wide">
                  Dad will remember that.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Regular Game Notifications */}
        {notifications.map((notif) => (
          <div
            key={notif.id}
            className="animate-in fade-in slide-in-from-left-3 duration-300 px-4 py-2 bg-black/85 border border-white/20 rounded-lg text-xs sm:text-sm text-neutral-100 shadow-xl font-crayon"
          >
            {notif.text}
          </div>
        ))}
      </div>

      {/* --- TOP CINEMATIC LETTERBOX (Cinematics Only) --- */}
      {isCinematic ? (
        <div className="w-full bg-black h-16 transition-all duration-500 ease-out flex items-center justify-end px-8">
        </div>
      ) : (
        <div className="h-0" />
      )}

      {/* --- SCREEN CENTER: SMALL SIMPLE DOT CROSSHAIR --- */}
      {!isCinematic && (
        <div className="relative flex-1 flex items-center justify-center pointer-events-none">
          {/* Small simple dot */}
          <div className="w-1.5 h-1.5 rounded-full bg-white/70" />
        </div>
      )}

      {/* --- DIALOGUE CHOICES --- */}
      {dialogueChoicesVisible && (
        <div className="pointer-events-auto mx-auto mb-6 w-full max-w-xl px-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div className="relative bg-black/90 rounded-2xl p-4 sm:p-5 shadow-2xl backdrop-blur-md">
            {/* Hand-drawn sketchy outer border */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none overflow-visible drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
              viewBox="0 0 400 200"
              preserveAspectRatio="none"
              fill="none"
            >
              <rect
                x="2"
                y="2"
                width="396"
                height="196"
                rx="16"
                ry="16"
                stroke="rgba(255, 255, 255, 0.45)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 18 3 C 120 2, 280 4, 382 3 C 392 3, 397 8, 397 18 C 396 70, 398 130, 397 182 C 397 192, 392 197, 382 197 C 280 196, 120 198, 18 197 C 8 197, 3 192, 3 182 C 4 130, 2 70, 3 18 C 3 8, 8 3, 18 3 Z"
                stroke="rgba(255, 255, 255, 0.25)"
                strokeWidth="1.2"
                strokeDasharray="25 4"
              />
            </svg>

            {/* Hand-drawn Prompt Title */}
            <div className="flex items-center justify-between mb-1 px-1">
              <span
                className="text-base sm:text-lg font-bold text-amber-200 tracking-wide font-crayon"
                style={{
                  textShadow:
                    '0 1px 3px rgba(0,0,0,0.95), -1px -1px 0 rgba(0,0,0,0.85), 1px -1px 0 rgba(0,0,0,0.85), -1px 1px 0 rgba(0,0,0,0.85), 1px 1px 0 rgba(0,0,0,0.85)',
                }}
              >
                What should Zane say?
              </span>
            </div>

            {/* Hand-drawn Crayon Countdown Line (only shown if not timer-free) */}
            {!timerFree && (
              <div className="relative w-full my-2.5 px-0.5">
                <svg
                  className="w-full h-3 overflow-visible"
                  viewBox="0 0 500 10"
                  preserveAspectRatio="none"
                >
                  {/* Background faint sketchy track */}
                  <path
                    d="M 2 5 Q 125 3, 250 6 T 498 5"
                    stroke="rgba(255, 255, 255, 0.16)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    fill="none"
                  />
                  {/* Active hand-drawn crayon countdown line */}
                  <path
                    d="M 2 5 Q 125 3, 250 6 T 498 5"
                    stroke={dialogueTimer > 25 ? '#fde047' : '#f87171'}
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    strokeDasharray="500"
                    strokeDashoffset={`${500 * (1 - dialogueTimer / 100)}`}
                    className="transition-[stroke-dashoffset,stroke] duration-100 ease-linear drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]"
                  />
                </svg>
              </div>
            )}

            {/* Choices Grid with Rough Crayon Rounded Boxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {customChoices && customChoices.length > 0 ? (
                customChoices.map((choice, idx) => (
                  <CrayonChoiceOption
                    key={choice.id}
                    numberLabel={String(idx + 1)}
                    text={choice.text}
                    onClick={() => {
                      setDialogueChoicesVisible(false);
                      onDialogueChoiceStateChange?.(false);
                      onDialogueChoice(choice.text, choice.outcome, choice.telltaleText);
                    }}
                  />
                ))
              ) : (
                <>
                  <CrayonChoiceOption
                    numberLabel="1"
                    text="“Coming, Dad! Calibrating blasters!”"
                    onClick={() => {
                      setDialogueChoicesVisible(false);
                      onDialogueChoiceStateChange?.(false);
                      onDialogueChoice(
                        '“Coming, Dad! Calibrating my dual blasters!”',
                        'Zane shouted down the stairs with cosmic enthusiasm.',
                        'Dad appreciated your quick compliance.'
                      );
                    }}
                  />

                  <CrayonChoiceOption
                    numberLabel="2"
                    text="“5 more minutes! Evading patrol!”"
                    onClick={() => {
                      setDialogueChoicesVisible(false);
                      onDialogueChoiceStateChange?.(false);
                      onDialogueChoice(
                        '“Just five more minutes! The corporate patrol hasn’t cleared Sector 9!”',
                        'Zane held his ground in character.',
                        'Dad will sigh at your daydreaming.'
                      );
                    }}
                  />

                  <CrayonChoiceOption
                    numberLabel="3"
                    text="“Is the radar detector calibrated?!”"
                    onClick={() => {
                      setDialogueChoicesVisible(false);
                      onDialogueChoiceStateChange?.(false);
                      onDialogueChoice(
                        '“Is the radar detector calibrated or is this a drill?!”',
                        'Zane asked a tactical question.',
                        'Dad respected the tactical awareness.'
                      );
                    }}
                  />

                  <CrayonChoiceOption
                    numberLabel="4"
                    text="[Silence]"
                    onClick={() => {
                      setDialogueChoicesVisible(false);
                      onDialogueChoiceStateChange?.(false);
                      onDialogueChoice(
                        '“...”',
                        'Zane remained silent, scanning the room.',
                        'Silence is also a valid choice.'
                      );
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- BOTTOM CINEMATIC LETTERBOX & SUBTITLES --- */}
      <div
        className={`w-full bg-black/95 transition-all duration-500 ease-out flex flex-col items-center justify-center px-6 py-3 ${
          isCinematic ? 'h-24' : subtitle.text ? (isShoutSubtitle ? 'h-28' : 'h-22') : 'h-0 opacity-0 pointer-events-none'
        }`}
      >
        {subtitle.text ? (
          <div className="max-w-4xl text-center px-4 flex flex-col items-center">
            {/* Speaker Name as a small handwritten label above the line */}
            {subtitle.speaker && (
              <div
                className={`mb-1 font-crayon font-bold tracking-wider inline-flex items-center justify-center ${
                  isShoutSubtitle ? 'text-red-400 text-sm sm:text-base uppercase tracking-widest' : 'text-amber-200 text-xs sm:text-sm'
                }`}
                style={{
                  textShadow:
                    '0 2px 4px rgba(0,0,0,0.95), -1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9), -1px 1px 0 rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9)',
                }}
              >
                {subtitle.speaker}
              </div>
            )}
            {/* Dialogue line in handwritten font; large jagged shaking subtitle when Dad shouts */}
            <div
              className={`font-crayon tracking-wide leading-relaxed ${
                isShoutSubtitle
                  ? 'text-2xl sm:text-3xl md:text-5xl font-black text-red-500 uppercase animate-jagged-shake drop-shadow-[0_4px_16px_rgba(239,68,68,0.9)]'
                  : 'text-base sm:text-lg md:text-xl font-normal text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'
              }`}
              style={
                isShoutSubtitle
                  ? {
                      textShadow:
                        '0 0 16px rgba(239, 68, 68, 0.9), 3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000',
                    }
                  : {
                      textShadow:
                        '0 2px 5px rgba(0,0,0,0.98), -1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9), -1px 1px 0 rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9)',
                    }
              }
            >
              {subtitle.text}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
