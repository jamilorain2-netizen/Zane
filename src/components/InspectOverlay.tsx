import React from 'react';
import { X, Sparkles, MapPin, Radio, Compass } from 'lucide-react';

interface InspectOverlayProps {
  type: 'drawings' | 'window' | 'holo_tv' | null;
  onClose: () => void;
}

export const InspectOverlay: React.FC<InspectOverlayProps> = ({ type, onClose }) => {
  if (!type) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60 font-crayon">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span className="text-base font-bold tracking-wider text-neutral-100">
              {type === 'drawings' && "Zane's Space Battle Crayon Chronicle"}
              {type === 'window' && "Sunny Morning Neighborhood Vista"}
              {type === 'holo_tv' && "Living Room Morning TV Broadcast"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-4 max-h-[75vh] overflow-y-auto font-crayon">
          {type === 'drawings' && (
            <div className="flex flex-col gap-4">
              <div className="relative aspect-4/3 rounded-xl overflow-hidden border border-neutral-700/60 shadow-inner bg-black">
                <img
                  src="/src/assets/images/crayon_space_drawings_1790936022898.jpg"
                  alt="Crayon drawings of space battles"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="p-4 rounded-xl bg-neutral-950/70 border border-neutral-800 text-sm leading-relaxed text-neutral-300">
                <p className="font-bold text-amber-300 text-base mb-1">“The Battle of Star Fortress Orion”</p>
                <p className="text-neutral-300 text-sm leading-relaxed">
                  Hand-drawn in red, yellow, and blue wax crayons. Zane depicted his bedroom furniture and toys transforming into spaceships, laser towers, and alien battlegrounds!
                </p>
                <div className="mt-3 flex items-center justify-between text-xs text-neutral-400 border-t border-neutral-800/80 pt-2 font-crayon">
                  <span>Artist: Zane (Age 11)</span>
                  <span className="text-amber-300 font-bold">Status: Masterpiece</span>
                </div>
              </div>
            </div>
          )}

          {type === 'window' && (
            <div className="flex flex-col gap-4">
              <div className="relative aspect-16/9 rounded-xl overflow-hidden border border-neutral-700/60 shadow-inner bg-sky-100 flex items-center justify-center">
                <div className="text-center p-6 bg-amber-50 text-amber-950 w-full h-full flex flex-col items-center justify-center">
                  <div className="text-3xl mb-2">☀️ 🌳 🏡</div>
                  <div className="font-bold text-lg text-amber-900">Bright Sunny Day</div>
                  <div className="text-sm text-amber-800 mt-1">Clear blue skies, green rolling hills, and morning birds chirping outside.</div>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-neutral-950/70 border border-neutral-800 text-sm leading-relaxed text-neutral-300">
                <p className="font-bold text-amber-300 text-base mb-1">Sunny Morning Bedroom Window</p>
                <p className="text-neutral-300 text-sm leading-relaxed">
                  Warm daylight streams through the windowpane into the bedroom. Outside, the suburban neighborhood is peaceful, cheerful, and full of sunshine.
                </p>
              </div>
            </div>
          )}

          {type === 'holo_tv' && (
            <div className="flex flex-col gap-4">
              <div className="p-6 rounded-xl bg-neutral-950 border border-neutral-800 text-sm leading-relaxed text-neutral-300">
                <p className="font-bold text-amber-300 text-base mb-1">Morning Broadcast — Channel 7 News</p>
                <p className="text-neutral-300 text-sm leading-relaxed">
                  “Good morning! It is a crisp, sunny 72 degrees in the neighborhood today. Perfect weather for morning playtime and outdoor games!”
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-end font-crayon">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-sm font-bold transition-all cursor-pointer"
          >
            Close [ESC]
          </button>
        </div>
      </div>
    </div>
  );
};
