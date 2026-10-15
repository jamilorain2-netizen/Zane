import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { soundEngine } from '../audio/soundEngine';
import { startEssentialsPreload, isEssentialsReady } from '../utils/assetLoader';
import { loadSettings, saveSettings, GameSettings } from '../utils/settings';

export interface StartMenuProps {
  onStartGame: (skipIntro: boolean) => void;
}

export const StartMenu: React.FC<StartMenuProps> = ({ onStartGame }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showWarning, setShowWarning] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [skipIntroChecked, setSkipIntroChecked] = useState<boolean>(false);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
  const [isHoverNewGame, setIsHoverNewGame] = useState<boolean>(false);
  const [isHoverSettings, setIsHoverSettings] = useState<boolean>(false);
  const [assetsReady, setAssetsReady] = useState<boolean>(isEssentialsReady());
  const [settings, setSettings] = useState<GameSettings>(loadSettings());

  const isDev = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('dev') === '1' || window.location.search.includes('dev=1');
  }, []);

  useEffect(() => {
    startEssentialsPreload().then(() => setAssetsReady(true));
    const interval = setInterval(() => {
      if (isEssentialsReady()) {
        setAssetsReady(true);
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Canvas grain, coffee ring, pencil smudges & animated drawings render loop
  useEffect(() => {
    let animId: number;
    let startTime = performance.now();

    const render = (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const elapsed = (time - startTime) * 0.001;

      ctx.clearRect(0, 0, w, h);

      // 1. Warm off-white paper background
      ctx.fillStyle = '#fbf8f2';
      ctx.fillRect(0, 0, w, h);

      // Paper grain / texture dots
      ctx.fillStyle = 'rgba(120, 113, 108, 0.04)';
      for (let i = 0; i < 600; i++) {
        const rx = (Math.sin(i * 123.45) * 10000) % w;
        const ry = (Math.cos(i * 678.90) * 10000) % h;
        ctx.fillRect(Math.abs(rx), Math.abs(ry), 2, 2);
      }

      // Slightly uneven notebook edges (sketchy border)
      ctx.strokeStyle = '#d7d3cb';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(15, 15);
      ctx.lineTo(w - 18, 12);
      ctx.lineTo(w - 12, h - 15);
      ctx.lineTo(20, h - 12);
      ctx.closePath();
      ctx.stroke();

      // Coffee-ring stain in top-right corner
      ctx.save();
      ctx.strokeStyle = 'rgba(180, 130, 80, 0.22)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(w - 120, 90, 45, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Pencil smudge / scribble in bottom left
      ctx.save();
      ctx.fillStyle = 'rgba(80, 70, 60, 0.12)';
      ctx.beginPath();
      ctx.ellipse(140, h - 80, 70, 25, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Taped corner effect top-left
      ctx.save();
      ctx.fillStyle = 'rgba(230, 220, 190, 0.75)';
      ctx.strokeStyle = 'rgba(200, 185, 150, 0.8)';
      ctx.lineWidth = 1;
      ctx.translate(45, 25);
      ctx.rotate(-0.15);
      ctx.fillRect(-30, -12, 70, 30);
      ctx.strokeRect(-30, -12, 70, 30);
      ctx.restore();

      // Subtle bobbing offset for drawings
      const bob = Math.sin(elapsed * 2.2) * 4;

      // Draw scattered crayon drawings:
      // 1. Rocket with flame (Left side)
      ctx.save();
      ctx.translate(120, 220 + bob);
      ctx.rotate(0.1);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.strokeStyle = '#991b1b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -35);
      ctx.lineTo(22, 20);
      ctx.lineTo(-22, 20);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(249, 115, 22, 0.9)';
      ctx.beginPath();
      ctx.moveTo(-15, 20);
      ctx.lineTo(0, 48 + Math.sin(elapsed * 12) * 6);
      ctx.lineTo(15, 20);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 2. Wobbly planet with rings
      ctx.save();
      ctx.translate(280, 110 + bob * 0.7);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
      ctx.strokeStyle = '#1e3a8a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.85)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(0, 0, 48, 14, 0.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 3. Stick-figure Zane with red cape
      ctx.save();
      ctx.translate(180, h - 140 - bob);
      ctx.strokeStyle = '#1c1917';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -25, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(220, 38, 38, 0.85)';
      ctx.beginPath();
      ctx.moveTo(-6, -15);
      ctx.lineTo(-28, 25);
      ctx.lineTo(5, 15);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.lineTo(0, 20);
      ctx.moveTo(0, 0);
      ctx.lineTo(-14, 12);
      ctx.moveTo(0, 0);
      ctx.lineTo(14, 12);
      ctx.moveTo(0, 20);
      ctx.lineTo(-10, 42);
      ctx.moveTo(0, 20);
      ctx.lineTo(10, 42);
      ctx.stroke();
      ctx.restore();

      // 4. Robot
      ctx.save();
      ctx.translate(w - 160, 240 + bob * 0.8);
      ctx.rotate(-0.08);
      ctx.fillStyle = 'rgba(100, 116, 139, 0.8)';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3;
      ctx.fillRect(-22, -28, 44, 52);
      ctx.strokeRect(-22, -28, 44, 52);
      ctx.beginPath();
      ctx.moveTo(0, -28);
      ctx.lineTo(0, -42);
      ctx.arc(0, -42, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
      ctx.restore();

      // 5. Crescent Moon & Twinkling Stars
      ctx.save();
      ctx.translate(w - 220, 100);
      ctx.fillStyle = 'rgba(234, 179, 8, 0.85)';
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0.5, Math.PI * 1.8);
      ctx.arc(8, -4, 20, Math.PI * 1.8, 0.5, true);
      ctx.fill();
      ctx.restore();

      const starPositions = [
        [360, 80], [w - 320, 140], [100, 120], [w - 100, 280], [220, 310]
      ];
      starPositions.forEach(([sx, sy], sIdx) => {
        const twinkle = Math.sin(elapsed * 4 + sIdx * 1.5) * 0.3 + 0.7;
        ctx.save();
        ctx.fillStyle = `rgba(234, 179, 8, ${twinkle})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // 6. UFO
      ctx.save();
      ctx.translate(w - 180, h - 130 + bob);
      ctx.rotate(0.05);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.75)';
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 36, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.beginPath();
      ctx.arc(0, -8, 14, Math.PI, 0, false);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // 7. Tiny house
      ctx.save();
      ctx.translate(w / 2 + 180, h - 110 - bob * 0.5);
      ctx.fillStyle = 'rgba(217, 119, 6, 0.75)';
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 3;
      ctx.fillRect(-18, -18, 36, 36);
      ctx.strokeRect(-18, -18, 36, 36);
      ctx.beginPath();
      ctx.moveTo(-22, -18);
      ctx.lineTo(0, -42);
      ctx.lineTo(22, -18);
      ctx.closePath();
      ctx.fillStyle = 'rgba(185, 28, 28, 0.8)';
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleNewGameClick = () => {
    soundEngine.playSoftClick();
    setShowWarning(true);
  };

  const handleSettingsClick = () => {
    soundEngine.playSoftClick();
    setShowSettings(true);
  };

  const handleSettingsBack = () => {
    soundEngine.playSoftClick();
    setShowSettings(false);
  };

  const handleOkayClick = () => {
    soundEngine.playItemPickup();
    setIsFadingOut(true);
    setTimeout(() => {
      onStartGame(skipIntroChecked);
    }, 600);
  };

  const handleBackClick = () => {
    soundEngine.playSoftClick();
    setShowWarning(false);
  };

  const handleQualityChange = (q: 'Low' | 'Medium' | 'High') => {
    soundEngine.playSoftClick();
    const updated = saveSettings({ graphicsQuality: q });
    setSettings({ ...updated });
  };

  const handleFpsChange = (fps: 30 | 60 | 120) => {
    soundEngine.playSoftClick();
    const updated = saveSettings({ fpsCap: fps });
    setSettings({ ...updated });
  };

  const handleReduceShakeChange = (reduce: boolean) => {
    soundEngine.playSoftClick();
    const updated = saveSettings({ reduceShake: reduce });
    setSettings({ ...updated });
  };

  const handleVolumeChange = (vol: number) => {
    const updated = saveSettings({ masterVolume: vol });
    setSettings({ ...updated });
    soundEngine.setMasterVolume(vol);
  };

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none overflow-hidden transition-opacity duration-600 ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
      }`}
    >
      <canvas
        ref={canvasRef}
        width={window.innerWidth}
        height={window.innerHeight}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      <div className="relative z-10 flex flex-col items-center max-w-2xl px-6 py-12 text-center">
        {/* Title */}
        <div className="mb-8 transform -rotate-1">
          <h1 className="text-5xl sm:text-7xl font-bold tracking-wider drop-shadow-md flex items-center justify-center gap-1.5 flex-wrap" style={{ fontFamily: "'Gaegu', cursive, sans-serif" }}>
            <span className="text-red-600 transform inline-block rotate-[-3deg]">Z</span>
            <span className="text-blue-600 transform inline-block rotate-[2deg]">a</span>
            <span className="text-amber-500 transform inline-block rotate-[-2deg]">n</span>
            <span className="text-emerald-600 transform inline-block rotate-[3deg]">e</span>
            <span className="mx-2">the</span>
            <span className="text-blue-500 transform inline-block rotate-[-2deg]">C</span>
            <span className="text-red-500 transform inline-block rotate-[3deg]">o</span>
            <span className="text-amber-600 transform inline-block rotate-[-1deg]">s</span>
            <span className="text-emerald-500 transform inline-block rotate-[2deg]">m</span>
            <span className="text-purple-600 transform inline-block rotate-[-3deg]">i</span>
            <span className="text-blue-600 transform inline-block rotate-[1deg]">c</span>
            <span className="ml-2 text-red-600 transform inline-block rotate-[-2deg]">H</span>
            <span className="text-amber-500 transform inline-block rotate-[3deg]">u</span>
            <span className="text-emerald-600 transform inline-block rotate-[-1deg]">n</span>
            <span className="text-blue-600 transform inline-block rotate-[2deg]">t</span>
            <span className="text-red-600 transform inline-block rotate-[-3deg]">e</span>
            <span className="text-purple-600 transform inline-block rotate-[1deg]">r</span>
          </h1>
          <div className="flex items-center justify-center gap-2 mt-2 text-amber-600">
            <svg className="w-48 h-6 overflow-visible" viewBox="0 0 200 20">
              <path
                d="M 5 12 Q 50 2, 100 10 T 195 8"
                fill="none"
                stroke="#d97706"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-2xl animate-spin-slow">★</span>
          </div>
        </div>

        {/* Menu Options: New Game & Settings */}
        {!showWarning && !showSettings ? (
          <div className="mt-6 flex flex-col items-center gap-4">
            <button
              onClick={handleNewGameClick}
              onMouseEnter={() => setIsHoverNewGame(true)}
              onMouseLeave={() => setIsHoverNewGame(false)}
              className={`relative px-8 py-4 text-2xl sm:text-3xl font-bold text-neutral-900 bg-amber-100/90 border-3 border-amber-800 rounded-lg shadow-[4px_6px_0px_#78350f] transform transition-all duration-200 cursor-pointer ${
                isHoverNewGame ? 'scale-105 -rotate-2 bg-amber-200' : 'rotate-1'
              }`}
              style={{ fontFamily: "'Patrick Hand', cursive, sans-serif" }}
            >
              <span>New Game</span>
              {!assetsReady && (
                <span className="block text-sm sm:text-base font-bold text-amber-800 tracking-wider animate-pulse mt-0.5" style={{ fontFamily: "'Patrick Hand', cursive, sans-serif" }}>
                  Loading...
                </span>
              )}
              {isHoverNewGame && (
                <div className="absolute -bottom-2 left-2 right-2 h-1 bg-red-600 rounded-full animate-pulse" />
              )}
            </button>

            <button
              onClick={handleSettingsClick}
              onMouseEnter={() => setIsHoverSettings(true)}
              onMouseLeave={() => setIsHoverSettings(false)}
              className={`relative px-8 py-3 text-xl sm:text-2xl font-bold text-neutral-900 bg-amber-50/90 border-3 border-amber-800 rounded-lg shadow-[4px_6px_0px_#78350f] transform transition-all duration-200 cursor-pointer ${
                isHoverSettings ? 'scale-105 rotate-2 bg-amber-100' : '-rotate-1'
              }`}
              style={{ fontFamily: "'Patrick Hand', cursive, sans-serif" }}
            >
              <span>Settings</span>
            </button>
          </div>
        ) : showWarning ? (
          /* Warning Card */
          <div className="relative mt-4 p-6 sm:p-8 bg-amber-50 border-2 border-stone-800 rounded-lg shadow-[0_15px_35px_rgba(0,0,0,0.25)] max-w-md transform rotate-1 animate-fade-in">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-28 h-6 bg-amber-200/85 border border-amber-400 rotate-[-1deg] shadow-sm" />

            <p className="text-lg sm:text-xl text-stone-900 leading-relaxed font-medium mb-6" style={{ fontFamily: "'Patrick Hand', cursive, sans-serif" }}>
              "This game is a short game, so it does not support a save game system."
            </p>

            {isDev && (
              <div className="flex items-center justify-center gap-2 mb-5 cursor-pointer" onClick={() => setSkipIntroChecked(!skipIntroChecked)}>
                <div className={`w-5 h-5 border-2 border-stone-800 flex items-center justify-center bg-white rounded ${skipIntroChecked ? 'bg-amber-300' : ''}`}>
                  {skipIntroChecked && <span className="text-stone-900 font-bold text-sm">✓</span>}
                </div>
                <span className="text-sm font-mono text-stone-800 font-bold">Skip intro cutscene</span>
              </div>
            )}

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handleOkayClick}
                className="px-6 py-2.5 text-xl font-bold text-white bg-red-600 hover:bg-red-700 border-2 border-red-900 rounded shadow-[3px_4px_0px_#450a0a] active:translate-y-0.5 cursor-pointer transition"
                style={{ fontFamily: "'Patrick Hand', cursive, sans-serif" }}
              >
                Okay
              </button>
              <button
                onClick={handleBackClick}
                className="px-5 py-2.5 text-lg font-bold text-stone-700 hover:text-stone-900 underline cursor-pointer transition"
                style={{ fontFamily: "'Patrick Hand', cursive, sans-serif" }}
              >
                Back
              </button>
            </div>
          </div>
        ) : (
          /* Settings Notebook Card */
          <div className="relative mt-2 p-6 sm:p-8 bg-amber-50 border-2 border-stone-800 rounded-lg shadow-[0_15px_35px_rgba(0,0,0,0.25)] max-w-md w-full transform -rotate-1 animate-fade-in">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-28 h-6 bg-amber-200/85 border border-amber-400 rotate-[1deg] shadow-sm" />

            <h2 className="text-2xl font-bold text-stone-900 mb-4 text-center" style={{ fontFamily: "'Patrick Hand', cursive, sans-serif" }}>
              Settings
            </h2>

            <div className="space-y-4 text-left mb-6" style={{ fontFamily: "'Patrick Hand', cursive, sans-serif" }}>
              {/* Graphics Quality */}
              <div>
                <label className="block text-lg font-bold text-stone-800 mb-1">Graphics Quality:</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Low', 'Medium', 'High'] as const).map((q) => (
                    <button
                      key={q}
                      onClick={() => handleQualityChange(q)}
                      className={`py-1.5 px-3 border-2 border-stone-800 rounded font-bold text-lg cursor-pointer transition ${
                        settings.graphicsQuality === q ? 'bg-amber-300 text-stone-900 shadow-inner' : 'bg-white/80 text-stone-700 hover:bg-amber-100'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Frame Rate Cap */}
              <div>
                <label className="block text-lg font-bold text-stone-800 mb-1">Frame Rate Cap:</label>
                <div className="grid grid-cols-3 gap-2">
                  {([30, 60, 120] as const).map((fps) => (
                    <button
                      key={fps}
                      onClick={() => handleFpsChange(fps)}
                      className={`py-1.5 px-3 border-2 border-stone-800 rounded font-bold text-lg cursor-pointer transition ${
                        settings.fpsCap === fps ? 'bg-amber-300 text-stone-900 shadow-inner' : 'bg-white/80 text-stone-700 hover:bg-amber-100'
                      }`}
                    >
                      {fps} FPS
                    </button>
                  ))}
                </div>
              </div>

              {/* Reduce Screen Shake */}
              <div className="flex items-center justify-between cursor-pointer" onClick={() => handleReduceShakeChange(!settings.reduceShake)}>
                <span className="text-lg font-bold text-stone-800">Reduce Screen Shake:</span>
                <div className={`px-4 py-1.5 border-2 border-stone-800 rounded font-bold text-lg ${settings.reduceShake ? 'bg-amber-300 text-stone-900' : 'bg-white/80 text-stone-700'}`}>
                  {settings.reduceShake ? 'ON' : 'OFF'}
                </div>
              </div>

              {/* Master Volume */}
              <div>
                <div className="flex justify-between text-lg font-bold text-stone-800 mb-1">
                  <span>Master Volume:</span>
                  <span>{Math.round(settings.masterVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.masterVolume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-full accent-amber-700 cursor-pointer h-3 bg-amber-200 border border-stone-800 rounded"
                />
              </div>
            </div>

            <div className="flex items-center justify-center">
              <button
                onClick={handleSettingsBack}
                className="px-6 py-2.5 text-xl font-bold text-stone-700 hover:text-stone-900 underline cursor-pointer transition"
                style={{ fontFamily: "'Patrick Hand', cursive, sans-serif" }}
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
