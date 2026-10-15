import React, { useMemo } from 'react';

export interface EndCardProps {
  onBackToMenu: () => void;
}

export const EndCard: React.FC<EndCardProps> = ({ onBackToMenu }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 select-none">
      <div
        className="relative p-8 sm:p-12 bg-[#fbf8f2] border-2 border-stone-800 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-w-xl w-full text-center transform -rotate-1 animate-fade-in"
        style={{ fontFamily: "'Patrick Hand', cursive, sans-serif" }}
      >
        {/* Tape at top */}
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-32 h-7 bg-amber-200/85 border border-amber-400 rotate-[-1.5deg] shadow-sm" />

        {/* Coffee ring stain top-right */}
        <div className="absolute top-3 right-3 w-16 h-16 rounded-full border-4 border-amber-800/15 pointer-events-none" />

        {/* Title */}
        <h1 className="text-5xl sm:text-6xl font-extrabold text-stone-900 tracking-wide mb-2">
          The End
        </h1>

        {/* Crayon Underline */}
        <div className="flex items-center justify-center gap-2 mb-8 text-amber-700">
          <svg className="w-48 h-6 overflow-visible" viewBox="0 0 200 20">
            <path
              d="M 5 12 Q 50 2, 100 10 T 195 8"
              fill="none"
              stroke="#b45309"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Helpline / Safety Note */}
        <div className="p-6 bg-amber-100/70 border border-amber-800/20 rounded-lg mb-8 shadow-inner">
          <p className="text-xl sm:text-2xl text-stone-800 leading-relaxed font-medium">
            "If you or someone you know is being hurt at home, please tell a trusted adult or contact a local child protection helpline."
          </p>
        </div>

        {/* Back to Menu Button */}
        <button
          onClick={onBackToMenu}
          className="px-8 py-3.5 text-2xl font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 border-2 border-red-900 rounded-lg shadow-[4px_6px_0px_#450a0a] transition-all cursor-pointer transform hover:-rotate-1"
        >
          Back to menu
        </button>
      </div>
    </div>
  );
};
