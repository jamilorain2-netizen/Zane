import React from 'react';

/**
 * Graphic Novel Paper Grain Overlay
 * Static, low-opacity paper texture (opacity 0.04)
 * Fixed in screen space without animation, camera movement, or hatch lines.
 */
export const GraphicNovelPaperOverlay: React.FC = () => {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden select-none">
      {/* Static SVG Paper Grain Filter Definition */}
      <svg className="hidden" aria-hidden="true">
        <defs>
          <filter id="comic-paper-grain" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.65"
              numOctaves="3"
              result="noise"
            />
            <feColorMatrix
              type="matrix"
              values="
                0 0 0 0 0.88
                0 0 0 0 0.86
                0 0 0 0 0.82
                0.20 0.20 0.20 0.12 0"
              result="paperColor"
            />
            <feBlend in="SourceGraphic" in2="paperColor" mode="multiply" />
          </filter>
        </defs>
      </svg>

      {/* 1. Fine Static Paper Grain Layer (opacity <= 0.04) */}
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-multiply"
        style={{
          filter: 'url(#comic-paper-grain)',
        }}
      />

      {/* 2. Graphic Novel Panel Inking Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(5,7,12,0.42)_100%)] mix-blend-multiply" />

      {/* 3. Subtle top and bottom panel edge ink bleed */}
      <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-black/30 to-transparent mix-blend-multiply" />
      <div className="absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-black/30 to-transparent mix-blend-multiply" />
    </div>
  );
};
