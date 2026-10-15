import React from 'react';
import { InteractionNode } from '../types/game';

export interface CrayonWorldLabelItem {
  id: string;
  name: string;
  position: [number, number, number];
  actionWord: 'Look' | 'Open' | 'Use' | 'Listen' | 'Align panel' | 'Give';
}

export const KNOWN_INTERACTION_LABELS: CrayonWorldLabelItem[] = [
  // Bedroom Scene
  {
    id: 'bedroom_drawings',
    name: 'Space Drawings',
    position: [-4.2, 2.1, -1.5],
    actionWord: 'Look',
  },
  {
    id: 'bedroom_cabinet',
    name: 'Wooden Cabinet',
    position: [-3.4, 1.2, 0.8],
    actionWord: 'Open',
  },
  {
    id: 'bedroom_window',
    name: 'Sunny Window',
    position: [0, 1.8, -4.0],
    actionWord: 'Look',
  },
  {
    id: 'bedroom_door',
    name: 'Bedroom Door',
    position: [0, 1.2, 4.2],
    actionWord: 'Open',
  },

  {
    id: 'house_basement',
    name: 'Basement Door',
    position: [1.6, 0.8, 11.0],
    actionWord: 'Listen',
  },
  {
    id: 'house_tv',
    name: 'Living Room TV',
    position: [6.8, 1.4, 16.5],
    actionWord: 'Look',
  },
  {
    id: 'house_kitchen',
    name: 'Kitchen Counter',
    position: [-6.8, 1.2, 16.5],
    actionWord: 'Look',
  },
  {
    id: 'house_restroom',
    name: 'Restroom Door',
    position: [0, 1.2, 19.2],
    actionWord: 'Open',
  },
  {
    id: 'kitchen_drawer',
    name: 'Kitchen Drawer',
    position: [-6.75, 0.85, 15.4],
    actionWord: 'Open',
  },
  {
    id: 'basement_wrench',
    name: "Dad's Wrench",
    position: [16.5, -2.25, 14.5],
    actionWord: 'Use',
  },
  {
    id: 'basement_breaker_box',
    name: 'Breaker box',
    position: [16.85, -1.2, 7.3],
    actionWord: 'Open',
  },
  {
    id: 'dad_give_wrench',
    name: 'Give wrench',
    position: [-6.0, 1.45, 7.5],
    actionWord: 'Give',
  },
  {
    id: 'hallway_panel_1',
    name: 'Hull Panel',
    position: [1.69, 1.5, 7.5],
    actionWord: 'Align panel',
  },
  {
    id: 'hallway_panel_2',
    name: 'Hull Panel',
    position: [1.69, 1.5, 10.0],
    actionWord: 'Align panel',
  },
];

export function getActionWordFromNode(node: InteractionNode): 'Look' | 'Open' | 'Use' | 'Listen' | 'Align panel' | 'Give' {
  if (node.id === 'house_basement') {
    if (node.promptVerb === 'Open') return 'Open';
    return 'Listen';
  }
  const verb = (node.promptVerb || '').toLowerCase();
  if (verb.includes('give')) {
    return 'Give';
  }
  if (verb.includes('align') || (node.id.startsWith('hallway_panel') && node.promptVerb === 'Align')) {
    return 'Align panel';
  }
  if (
    verb.includes('open') ||
    verb.includes('door') ||
    verb.includes('enter') ||
    verb.includes('exit')
  ) {
    return 'Open';
  }
  if (
    verb.includes('look') ||
    verb.includes('view') ||
    verb.includes('watch') ||
    verb.includes('inspect') ||
    verb.includes('see')
  ) {
    return 'Look';
  }
  if (verb.includes('listen') || verb.includes('hear')) {
    return 'Listen';
  }
  if (verb.includes('use') || verb.includes('take') || verb.includes('pick') || verb.includes('grab')) {
    return 'Use';
  }
  return 'Look';
}

// Letter-by-letter organic baseline wobble for playful crayon doodle feel
export const WobbleBaselineText: React.FC<{ text: string }> = ({ text }) => {
  return (
    <span className="inline-flex whitespace-nowrap select-none font-crayon">
      {text.split('').map((char, index) => {
        const yOffset = ((index * 7) % 5) * 0.45 - 0.9;
        const rot = ((index * 11) % 7) * 0.6 - 1.8;
        return (
          <span
            key={index}
            style={{
              display: 'inline-block',
              transform: `translateY(${yOffset}px) rotate(${rot}deg)`,
            }}
          >
            {char === ' ' ? '\u00A0' : char}
          </span>
        );
      })}
    </span>
  );
};

// Sketchy hand-drawn crayon marker (rough imperfect white diamond)
export const CrayonMarkerSvg: React.FC = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 28 28"
    fill="none"
    className="overflow-visible drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]"
  >
    {/* Soft crayon interior wash */}
    <path
      d="M 14 3.5 L 24 13.8 L 14 24.5 L 4 13.8 Z"
      fill="rgba(255, 255, 255, 0.18)"
    />
    {/* Sketchy primary white crayon outline with uneven thickness */}
    <path
      d="M 14 3 C 16.5 4.5, 23.5 11.2, 24.2 13.6 C 24.6 16.2, 16.8 23.2, 14 24.8 C 11.2 23.2, 3.4 16.2, 3.8 13.6 C 4.5 11.2, 11.5 4.5, 14 3 Z"
      stroke="#ffffff"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Rough second overlay sketch pass */}
    <path
      d="M 13.8 3.8 C 16.8 5.2, 23 11.6, 23.6 13.9 C 24 15.4, 16.5 22.4, 14.1 24.1 C 11.6 22.2, 4.2 15.6, 4.6 13.8 C 5 11.6, 11.2 5.2, 13.8 3.8"
      stroke="#f3f4f6"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray="20 4"
    />
  </svg>
);

// Yellow crayon-drawn burst of short rays around the focused marker
export const CrayonYellowBurstSvg: React.FC = () => (
  <svg
    className="absolute -inset-3 w-14 h-14 pointer-events-none overflow-visible drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
    viewBox="0 0 56 56"
    fill="none"
  >
    {/* 8 short sketchy crayon rays */}
    <path d="M 28 8 L 28 2" stroke="#facc15" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M 28 48 L 28 54" stroke="#fde047" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M 8 28 L 2 28" stroke="#facc15" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M 48 28 L 54 28" stroke="#fde047" strokeWidth="2.6" strokeLinecap="round" />
    {/* Diagonal short rays */}
    <path d="M 14 14 L 9 9" stroke="#fef08a" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M 42 42 L 47 47" stroke="#facc15" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M 42 14 L 47 9" stroke="#fde047" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M 14 42 L 9 47" stroke="#fef08a" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

interface CrayonFloatingLabelsProps {
  onExecuteInteraction: () => void;
  registerItemRef: (id: string, el: HTMLDivElement | null) => void;
  registerNameRef: (id: string, el: HTMLElement | null) => void;
  registerBurstRef: (id: string, el: HTMLElement | null) => void;
  registerActionRef: (id: string, el: HTMLElement | null) => void;
  registerActionWordRef: (id: string, el: HTMLElement | null) => void;
  registerMarkerRef: (id: string, el: HTMLElement | null) => void;
}

export const CrayonFloatingLabels: React.FC<CrayonFloatingLabelsProps> = ({
  onExecuteInteraction,
  registerItemRef,
  registerNameRef,
  registerBurstRef,
  registerActionRef,
  registerActionWordRef,
  registerMarkerRef,
}) => {
  return (
    <div
      id="crayon-world-labels-container"
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden select-none"
    >
      {KNOWN_INTERACTION_LABELS.map((item) => (
        <div
          key={item.id}
          ref={(el) => registerItemRef(item.id, el)}
          className="absolute left-0 top-0 flex flex-col items-center pointer-events-none transition-opacity duration-150"
          style={{
            display: 'none',
            opacity: 0,
            transform: 'translate3d(0px, 0px, 0px) translate(-50%, -50%)',
            willChange: 'transform, opacity',
          }}
        >
          {/* Object Name in white handwritten text with soft dark outline */}
          <div
            ref={(el) => registerNameRef(item.id, el)}
            data-name={item.name}
            className={`mb-1 text-center font-crayon text-neutral-100 whitespace-nowrap transition-all duration-150 ${
              item.id === 'basement_breaker_box' ? 'text-sky-200' : ''
            }`}
            style={{
              fontSize: '14px',
              textShadow:
                item.id === 'basement_breaker_box'
                  ? '0 0 12px rgba(56, 189, 248, 0.85), 0 2px 4px rgba(0,0,0,0.9)'
                  : '0 2px 4px rgba(0,0,0,0.9), -1px -1px 0 rgba(0,0,0,0.8), 1px -1px 0 rgba(0,0,0,0.8), -1px 1px 0 rgba(0,0,0,0.8), 1px 1px 0 rgba(0,0,0,0.8)',
            }}
          >
            <WobbleBaselineText text={item.name} />
          </div>

          {/* Marker Anchor Container */}
          <div className="relative flex items-center justify-center">
            {/* Gentle pulse container for crayon marker */}
            <div
              ref={(el) => registerMarkerRef(item.id, el)}
              className="relative flex items-center justify-center"
            >
              {/* Yellow crayon burst rays (shown only when focused) */}
              <div
                ref={(el) => registerBurstRef(item.id, el)}
                style={{ display: 'none' }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <CrayonYellowBurstSvg />
              </div>

              {/* Hand-drawn crayon marker */}
              <CrayonMarkerSvg />
            </div>

            {/* Action Prompt Next to Marker (shown only when focused) */}
            <div
              ref={(el) => registerActionRef(item.id, el)}
              style={{ display: 'none' }}
              className="absolute left-4 -top-3.5 flex items-center pointer-events-none"
            >
              {/* Thin dashed curved green line connecting marker to button */}
              <svg
                className="absolute left-0 top-3 w-12 h-9 pointer-events-none overflow-visible drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                viewBox="0 0 48 36"
                fill="none"
              >
                <path
                  d="M 5 20 Q 24 3, 42 14"
                  stroke="#4ade80"
                  strokeWidth="2.0"
                  strokeDasharray="3.5 3.5"
                  strokeLinecap="round"
                />
              </svg>

              {/* Action Button & Word Container */}
              <div className="relative ml-9 flex flex-col items-center">
                {/* Action word above button in handwritten font */}
                <span
                  ref={(el) => registerActionWordRef(item.id, el)}
                  className="mb-0.5 text-xs font-bold text-emerald-200 tracking-wider font-crayon uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] whitespace-nowrap"
                  style={{
                    textShadow:
                      '0 2px 4px rgba(0,0,0,0.95), -1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9), -1px 1px 0 rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9)',
                  }}
                >
                  <WobbleBaselineText text={item.actionWord} />
                </span>

                {/* Round button with hand-drawn outline in green */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExecuteInteraction();
                  }}
                  className="relative w-8 h-8 flex items-center justify-center pointer-events-auto cursor-pointer group focus:outline-none transition-transform hover:scale-110 active:scale-95"
                >
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 32 32"
                    fill="none"
                    className="absolute inset-0 overflow-visible drop-shadow-[0_2px_5px_rgba(0,0,0,0.85)]"
                  >
                    {/* Dark green translucent base */}
                    <circle cx="16" cy="16" r="13" fill="#052e16" fillOpacity="0.88" />
                    {/* Hand-drawn sketchy green circle */}
                    <path
                      d="M 16 3 C 23.5 2.6, 29 8, 29.5 15.5 C 30 23, 24.2 28.5, 16 29 C 7.8 29.5, 2.5 23.5, 2.8 16 C 3.1 8.5, 8.5 3.4, 16 3 Z"
                      stroke="#22c55e"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M 15.8 4.2 C 22.8 3.8, 28 8.8, 28.4 15.8 C 28.8 22.2, 23.5 27.8, 16.2 28.2 C 8.8 28.6, 3.8 22.8, 4.1 16.2 C 4.4 9.4, 9.4 4.5, 15.8 4.2"
                      stroke="#86efac"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeDasharray="20 3"
                    />
                  </svg>

                  {/* Letter E in handwritten font */}
                  <span className="relative z-10 text-base font-bold text-neutral-100 font-crayon group-hover:text-emerald-200 transition-colors drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                    E
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
