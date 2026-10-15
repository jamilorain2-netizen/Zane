import React, { useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';

export interface PowerRestoreMinigameProps {
  isOpen: boolean;
  onClose: () => void;
  onWin: () => void;
  onSubtitleChange: (speaker: string, text: string) => void;
  onTelltaleNotification?: (text: string) => void;
}

interface WireColor {
  id: string;
  name: string;
  color: string;
  lightColor: string;
}

const WIRE_COLORS: WireColor[] = [
  { id: 'red', name: 'RED', color: '#ef4444', lightColor: '#fca5a5' },
  { id: 'blue', name: 'BLUE', color: '#3b82f6', lightColor: '#93c5fd' },
  { id: 'yellow', name: 'YELLOW', color: '#eab308', lightColor: '#fde047' },
  { id: 'green', name: 'GREEN', color: '#22c55e', lightColor: '#86efac' },
  { id: 'orange', name: 'ORANGE', color: '#f97316', lightColor: '#fdba74' },
];

// Persistent state across closes so Esc never loses player connections
let savedConnections: Record<string, string> = {};
let savedSocketOrder: string[] = ['green', 'orange', 'red', 'yellow', 'blue'];

export const PowerRestoreMinigame: React.FC<PowerRestoreMinigameProps> = ({
  isOpen,
  onClose,
  onWin,
  onSubtitleChange,
  onTelltaleNotification,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const CANVAS_WIDTH = 840;
  const CANVAS_HEIGHT = 480;

  // Left terminal coordinates (5 fixed slots)
  const leftX = 130;
  const leftYs = [85, 160, 235, 310, 385];

  // Right socket coordinates (5 fixed slots)
  const rightX = 710;
  const rightYs = [85, 160, 235, 310, 385];

  const [socketOrder, setSocketOrder] = useState<string[]>(() => {
    if (savedSocketOrder.length === 5) return [...savedSocketOrder];
    return ['green', 'orange', 'red', 'yellow', 'blue'];
  });
  const socketOrderRef = useRef<string[]>(socketOrder);

  const [connections, setConnections] = useState<Record<string, string>>(() => ({ ...savedConnections }));
  const connectionsRef = useRef<Record<string, string>>({ ...savedConnections });

  const draggingWireRef = useRef<string | null>(null);
  const dragPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Difficulty 1: Swap unconnected sockets every 7 seconds with 0.5s warning wiggle
  const wigglingSocketsRef = useRef<[string, string] | null>(null);
  const isWigglingRef = useRef<boolean>(false);
  const wiggleTimerRef = useRef<number>(0);

  // Difficulty 2: Gear obstacle sweeping across middle on a 3-second cycle, blocking for 0.8s
  const gearBlockTimerRef = useRef<boolean>(false);

  // Animated spark particles on snap back
  const sparksRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; color: string }[]>([]);

  const isWonRef = useRef<boolean>(false);

  useEffect(() => {
    connectionsRef.current = connections;
    savedConnections = connections;
  }, [connections]);

  useEffect(() => {
    socketOrderRef.current = socketOrder;
    savedSocketOrder = socketOrder;
  }, [socketOrder]);

  // Release pointer lock on open
  useEffect(() => {
    if (isOpen) {
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
    }
  }, [isOpen]);

  // ESC handler (keeps connections, no fail screen)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Difficulty 1: Every 7 seconds two unconnected sockets swap places after a 0.5s warning wiggle
  useEffect(() => {
    if (!isOpen || isWonRef.current) return;

    let timeoutId: number;
    let wiggleIntervalId: number;

    const runSwapCycle = () => {
      // 6.5s quiet countdown, followed by 0.5s warning wiggle = 7.0s total cycle
      timeoutId = window.setTimeout(() => {
        if (!isOpen || isWonRef.current) return;

        // Choose strictly 2 UNCONNECTED sockets so connected wires never move
        const currentOrder = socketOrderRef.current;
        const currentConns = connectionsRef.current;
        const unconnected = currentOrder.filter((color) => !currentConns[color]);

        if (unconnected.length >= 2) {
          // Pick two distinct unconnected sockets
          const shuffledUnconnected = [...unconnected].sort(() => Math.random() - 0.5);
          const sockA = shuffledUnconnected[0];
          const sockB = shuffledUnconnected[1];

          wigglingSocketsRef.current = [sockA, sockB];
          isWigglingRef.current = true;
          wiggleTimerRef.current = 0;

          // Warning wiggle for 0.5 seconds
          const startWiggleTime = performance.now();
          wiggleIntervalId = window.setInterval(() => {
            const elapsed = (performance.now() - startWiggleTime) / 1000;
            wiggleTimerRef.current = elapsed;

            if (elapsed >= 0.5) {
              clearInterval(wiggleIntervalId);
              isWigglingRef.current = false;
              wigglingSocketsRef.current = null;

              // Execute swap of unconnected sockets in socketOrder
              setSocketOrder((prev) => {
                const next = [...prev];
                const idxA = next.indexOf(sockA);
                const idxB = next.indexOf(sockB);
                if (idxA !== -1 && idxB !== -1) {
                  const temp = next[idxA];
                  next[idxA] = next[idxB];
                  next[idxB] = temp;
                }
                return next;
              });

              soundEngine.playSoftClick();
              runSwapCycle();
            }
          }, 20);
        } else {
          // Not enough unconnected sockets to swap (almost or fully solved)
          runSwapCycle();
        }
      }, 6500);
    };

    runSwapCycle();

    return () => {
      clearTimeout(timeoutId);
      clearInterval(wiggleIntervalId);
    };
  }, [isOpen]);

  const spawnSparks = (x: number, y: number, color: string) => {
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      sparksRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color: Math.random() > 0.4 ? color : '#fef08a',
      });
    }
  };

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isOpen || isWonRef.current) return;
    const { x, y } = getCanvasCoords(e);

    // Check if clicked near any left terminal
    WIRE_COLORS.forEach((wire, idx) => {
      const ty = leftYs[idx];
      if (Math.hypot(x - leftX, y - ty) <= 28) {
        // If already connected, allow re-dragging
        if (connectionsRef.current[wire.id]) {
          const updated = { ...connectionsRef.current };
          delete updated[wire.id];
          setConnections(updated);
        }
        draggingWireRef.current = wire.id;
        dragPosRef.current = { x, y };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        soundEngine.playSoftClick();
      }
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isOpen || isWonRef.current || !draggingWireRef.current) return;
    const { x, y } = getCanvasCoords(e);
    dragPosRef.current = { x, y };

    // If gear is currently blocking middle and dragging wire passes through middle gear zone
    if (gearBlockTimerRef.current && x >= 350 && x <= 470) {
      // Wire gets clipped by the sweeping gear!
      const wireId = draggingWireRef.current;
      draggingWireRef.current = null;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}

      spawnSparks(x, y, '#ef4444');
      soundEngine.playSpark();
      onTelltaleNotification?.('Sparks! Sweeping gear blocked drag.');
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingWireRef.current) return;
    const wireId = draggingWireRef.current;
    draggingWireRef.current = null;

    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const { x, y } = dragPosRef.current;

    // Check if blocked by gear in middle
    if (gearBlockTimerRef.current && x >= 340 && x <= 480) {
      spawnSparks(x, y, '#ef4444');
      soundEngine.playSpark();
      onTelltaleNotification?.('Sparks! Sweeping gear blocked wire.');
      return;
    }

    // Check if dropped near any socket on the right
    let targetSocketColor: string | null = null;
    let targetSocketPos = { x: rightX, y: 0 };
    socketOrderRef.current.forEach((sockColor, idx) => {
      const sy = rightYs[idx];
      if (Math.hypot(x - rightX, y - sy) <= 32) {
        targetSocketColor = sockColor;
        targetSocketPos = { x: rightX, y: sy };
      }
    });

    if (targetSocketColor) {
      if (targetSocketColor === wireId) {
        // Correct match! Clicks and stays
        soundEngine.playSoftClick();
        const updated = { ...connectionsRef.current, [wireId]: targetSocketColor };
        setConnections(updated);

        // Check if all five wires are connected
        if (Object.keys(updated).length === 5) {
          isWonRef.current = true;
          soundEngine.playItemPickup();
          onSubtitleChange('Zane', '“Power’s back.”');
          soundEngine.speakLine("Power's back.", 'zane');
          onTelltaleNotification?.('Power Restored');

          window.setTimeout(() => {
            onWin();
          }, 600);
        }
      } else {
        // Wrong socket -> snap back with spark sound
        spawnSparks(targetSocketPos.x, targetSocketPos.y, '#f59e0b');
        soundEngine.playSpark();
        onTelltaleNotification?.('Wrong socket! Spark!');
      }
    }
  };

  // Main canvas drawing loop (60 FPS)
  useEffect(() => {
    if (!isOpen) return;
    let animId: number;

    const render = (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 1. Dark outer steel enclosure frame
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.strokeStyle = '#27272a';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, CANVAS_WIDTH - 8, CANVAS_HEIGHT - 8);

      // Industrial corner bolts
      const boltPositions = [
        [16, 16],
        [CANVAS_WIDTH - 16, 16],
        [16, CANVAS_HEIGHT - 16],
        [CANVAS_WIDTH - 16, CANVAS_HEIGHT - 16],
      ];
      boltPositions.forEach(([bx, by]) => {
        ctx.fillStyle = '#52525b';
        ctx.beginPath();
        ctx.arc(bx, by, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#71717a';
        ctx.beginPath();
        ctx.arc(bx - 1, by - 1, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      // 2. Hand-drawn aged schematic paper background inside box
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(28, 28, CANVAS_WIDTH - 56, CANVAS_HEIGHT - 56);

      // Crayon technical grid lines
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.14)';
      ctx.lineWidth = 1.2;
      for (let x = 60; x < CANVAS_WIDTH - 40; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 28);
        ctx.lineTo(x, CANVAS_HEIGHT - 28);
        ctx.stroke();
      }
      for (let y = 60; y < CANVAS_HEIGHT - 40; y += 40) {
        ctx.beginPath();
        ctx.moveTo(28, y);
        ctx.lineTo(CANVAS_WIDTH - 28, y);
        ctx.stroke();
      }

      // Schematic blueprint annotations
      ctx.fillStyle = '#b45309';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('DIAGRAM: 120V-AUX-RELAY', 40, 48);
      ctx.fillText('WARNING: LIVE WIRES', CANVAS_WIDTH - 210, 48);

      // 3. Difficulty 2: One gear drawing sweeps across middle on a 3-second cycle, blocking for 0.8s
      const cycleSec = (timestamp % 3000) / 1000; // 0.0 to 3.0s
      // Active blocking window: 1.1s to 1.9s (duration = 0.8s)
      const isGearBlocking = cycleSec >= 1.1 && cycleSec <= 1.9;
      gearBlockTimerRef.current = isGearBlocking;

      // Sweeping position across vertical middle
      const sweepProgress = isGearBlocking ? (cycleSec - 1.1) / 0.8 : (cycleSec < 1.1 ? cycleSec / 1.1 : (cycleSec - 1.9) / 1.1);
      const gearX = 410;
      const gearY = isGearBlocking
        ? 80 + sweepProgress * 300 // sweeps down across center during the 0.8s blocking window
        : (cycleSec < 1.1 ? 40 : 420); // parked off-center when not blocking

      const gearRadius = isGearBlocking ? 46 : 34;
      const gearRotation = timestamp * 0.003;

      // Draw gear sweep corridor indicator
      ctx.save();
      ctx.fillStyle = isGearBlocking ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.04)';
      ctx.strokeStyle = isGearBlocking ? 'rgba(239, 68, 68, 0.4)' : 'rgba(161, 98, 7, 0.2)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(345, 55, 130, 360);
      ctx.fillRect(345, 55, 130, 360);
      ctx.restore();

      // Draw Gear Drawing in Hand-Drawn / Crayon Style
      ctx.save();
      ctx.translate(gearX, gearY);
      ctx.rotate(gearRotation);

      ctx.fillStyle = isGearBlocking ? '#dc2626' : '#78350f';
      ctx.strokeStyle = isGearBlocking ? '#991b1b' : '#451a03';
      ctx.lineWidth = 3.5;

      // Gear teeth
      const teethCount = 10;
      ctx.beginPath();
      for (let i = 0; i < teethCount; i++) {
        const a1 = (i / teethCount) * Math.PI * 2;
        const a2 = a1 + (Math.PI / teethCount) * 0.5;
        const a3 = a1 + (Math.PI / teethCount);
        const rOuter = gearRadius + 8;
        const rInner = gearRadius;

        const x1 = Math.cos(a1) * rInner;
        const y1 = Math.sin(a1) * rInner;
        const x2 = Math.cos(a1) * rOuter;
        const y2 = Math.sin(a1) * rOuter;
        const x3 = Math.cos(a2) * rOuter;
        const y3 = Math.sin(a2) * rOuter;
        const x4 = Math.cos(a3) * rInner;
        const y4 = Math.sin(a3) * rInner;

        if (i === 0) ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.lineTo(x4, y4);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Gear inner hub
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.arc(0, 0, gearRadius * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();

      // Gear status label
      ctx.save();
      ctx.fillStyle = isGearBlocking ? '#b91c1c' : '#a16207';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isGearBlocking ? '⚠ GEAR: BLOCKED (0.8s)' : 'GEAR: SWEEPING (CLEAR)', 410, 435);
      ctx.restore();

      // 4. Draw Connected Wires
      WIRE_COLORS.forEach((wire, idx) => {
        const ty = leftYs[idx];
        const connectedSockColor = connections[wire.id];
        if (connectedSockColor) {
          const sockIdx = socketOrder.indexOf(connectedSockColor);
          if (sockIdx !== -1) {
            const sy = rightYs[sockIdx];
            ctx.save();
            ctx.strokeStyle = wire.color;
            ctx.lineWidth = 7;
            ctx.lineCap = 'round';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetY = 3;

            // Organic hand-drawn wire curve connecting left to right socket
            ctx.beginPath();
            ctx.moveTo(leftX, ty);
            ctx.bezierCurveTo(leftX + 220, ty, rightX - 220, sy, rightX, sy);
            ctx.stroke();
            ctx.restore();
          }
        }
      });

      // 5. Draw Currently Dragging Wire
      if (draggingWireRef.current) {
        const wireId = draggingWireRef.current;
        const wireObj = WIRE_COLORS.find((w) => w.id === wireId);
        const wireIdx = WIRE_COLORS.findIndex((w) => w.id === wireId);
        if (wireObj && wireIdx !== -1) {
          const ty = leftYs[wireIdx];
          const curPos = dragPosRef.current;
          ctx.save();
          ctx.strokeStyle = wireObj.color;
          ctx.lineWidth = 7;
          ctx.lineCap = 'round';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(leftX, ty);
          ctx.bezierCurveTo(leftX + 160, ty, curPos.x - 60, curPos.y, curPos.x, curPos.y);
          ctx.stroke();

          // Copper wire tip
          ctx.fillStyle = '#b45309';
          ctx.beginPath();
          ctx.arc(curPos.x, curPos.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // 6. Draw Left Terminals (5 colored wire ends)
      WIRE_COLORS.forEach((wire, idx) => {
        const ty = leftYs[idx];
        const isConnected = Boolean(connections[wire.id]);

        ctx.save();
        // Terminal backing block
        ctx.fillStyle = '#27272a';
        ctx.strokeStyle = '#18181b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(leftX - 100, ty - 22, 114, 44, 6);
        ctx.fill();
        ctx.stroke();

        // Terminal circle connector
        ctx.fillStyle = wire.color;
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(leftX, ty, isConnected ? 12 : 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Center screw
        ctx.fillStyle = '#1c1917';
        ctx.beginPath();
        ctx.arc(leftX, ty, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Crayon colored label
        ctx.fillStyle = wire.lightColor;
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(wire.name, leftX - 90, ty + 4);
        ctx.restore();
      });

      // 7. Draw Right Sockets (5 sockets in shuffled order, each marked with color)
      // Wiggle warning animation: if wiggling, shake by oscillating offset
      const wiggleOffset = isWigglingRef.current ? Math.sin(wiggleTimerRef.current * Math.PI * 18) * 8 : 0;

      socketOrder.forEach((sockColor, idx) => {
        const wireObj = WIRE_COLORS.find((w) => w.id === sockColor);
        const isConnected = Boolean(Object.values(connections).includes(sockColor));
        const isWigglingThisSocket = isWigglingRef.current && wigglingSocketsRef.current?.includes(sockColor);
        const sy = rightYs[idx] + (isWigglingThisSocket ? wiggleOffset : 0);

        ctx.save();
        // Socket enclosure box
        ctx.fillStyle = '#27272a';
        ctx.strokeStyle = isWigglingThisSocket ? '#ef4444' : (isConnected ? '#22c55e' : '#52525b');
        ctx.lineWidth = isWigglingThisSocket ? 4 : 2.5;
        ctx.beginPath();
        ctx.roundRect(rightX - 22, sy - 26, 120, 52, 6);
        ctx.fill();
        ctx.stroke();

        // Socket circular receptacle
        ctx.fillStyle = wireObj ? wireObj.color : '#fff';
        ctx.strokeStyle = '#18181b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(rightX, sy, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Socket center hole
        ctx.fillStyle = '#09090b';
        ctx.beginPath();
        ctx.arc(rightX, sy, 6, 0, Math.PI * 2);
        ctx.fill();

        // Socket color label
        ctx.fillStyle = wireObj ? wireObj.lightColor : '#fef08a';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`[ ${wireObj ? wireObj.name : sockColor.toUpperCase()} ]`, rightX + 24, sy + 4);

        if (isWigglingThisSocket) {
          ctx.fillStyle = '#ef4444';
          ctx.font = 'bold 10px monospace';
          ctx.fillText('⚠ SWAPPING!', rightX + 24, sy - 14);
        } else if (isConnected) {
          ctx.fillStyle = '#22c55e';
          ctx.font = 'bold 10px monospace';
          ctx.fillText('✓ LOCKED', rightX + 24, sy - 14);
        }

        ctx.restore();
      });

      // 8. Draw Animated Spark Particles
      if (sparksRef.current.length > 0) {
        ctx.save();
        for (let i = sparksRef.current.length - 1; i >= 0; i--) {
          const spark = sparksRef.current[i];
          spark.x += spark.vx;
          spark.y += spark.vy;
          spark.life -= 0.04;

          if (spark.life <= 0) {
            sparksRef.current.splice(i, 1);
            continue;
          }

          ctx.fillStyle = spark.color;
          ctx.globalAlpha = Math.max(0, spark.life);
          ctx.beginPath();
          ctx.arc(spark.x, spark.y, 2.5 * spark.life, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, socketOrder, connections]);

  if (!isOpen) return null;

  const connectedCount = Object.keys(connections).length;

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/85 backdrop-blur-sm select-none pointer-events-auto"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) e.stopPropagation();
      }}
    >
      <div
        className="relative w-full max-w-[880px] bg-neutral-900 border border-amber-600/60 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden font-sans text-neutral-100"
        style={{
          clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)',
        }}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-neutral-950 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-mono text-sm tracking-wider uppercase font-bold text-amber-300">
              POWER RESTORE // BREAKER PANEL
            </span>
          </div>

          {/* Right: ESC // RETURN Button (standard game position) */}
          <div className="flex items-center gap-2 z-50">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider bg-slate-900 hover:bg-slate-800 text-cyan-300 hover:text-white border border-cyan-500/80 hover:border-orange-400 shadow-[0_0_12px_rgba(6,182,212,0.3)] active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer z-50"
              style={{
                clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)',
              }}
            >
              <span className="text-orange-400 font-bold">[ESC]</span>
              <span>ESC // RETURN</span>
            </button>
          </div>
        </div>

        {/* Canvas Display Viewport */}
        <div className="relative p-4 flex flex-col items-center justify-center bg-stone-950">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="w-full max-w-[840px] h-auto border-2 border-stone-800 rounded-lg shadow-2xl cursor-crosshair touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />

          {/* Bottom Guidance & Status */}
          <div className="w-full max-w-[840px] mt-2.5 flex items-center justify-between text-xs text-stone-400 font-mono">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-bold">DRAG WIRES:</span>
              <span>Match color to socket. Avoid sweeping gear & watch for 7s socket shifts!</span>
            </div>
            <div>
              <span className="text-amber-400 font-bold">Circuits: </span>
              <span className={connectedCount === 5 ? 'text-green-400 font-bold' : 'text-stone-300'}>
                {connectedCount} / 5
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
