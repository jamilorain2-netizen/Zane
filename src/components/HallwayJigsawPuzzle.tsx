import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { soundEngine } from '../audio/soundEngine';

export interface HallwayJigsawPuzzleProps {
  panelId: string;
  onClose: () => void;
  onComplete: (panelId: string) => void;
  onSubtitleChange: (speaker: string, text: string) => void;
}

interface PieceState {
  id: number;
  col: number;
  row: number;
  targetX: number;
  targetY: number;
  x: number;
  y: number;
  rotation: number;
  isPlaced: boolean;
  dataUrl: string;
}

interface SparkParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
}

// Persistent progress storage across puzzle reopenings
const savedPuzzleProgress: Record<
  string,
  {
    placedIds: number[];
    positions: Record<number, { x: number; y: number; rotation: number }>;
  }
> = {};

export const HallwayJigsawPuzzle: React.FC<HallwayJigsawPuzzleProps> = ({
  panelId,
  onClose,
  onComplete,
  onSubtitleChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState<number>(1);
  const [pieces, setPieces] = useState<PieceState[]>([]);
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Board design position inside 1280x720 stage
  const boardX = 560;
  const boardY = 100;
  const boardWidth = 600;
  const boardHeight = 360;

  // Source image dataUrl for always-on background ghost guide on reconstruction board
  const [fullImageDataUrl, setFullImageDataUrl] = useState<string>('');
  const [isRKeyDown, setIsRKeyDown] = useState<boolean>(false);

  // Mouse telemetry coordinates in stage units
  const [mouseCoords, setMouseCoords] = useState<{ x: number; y: number }>({ x: 640, y: 360 });

  // Piece decoding animations (id of newly snapped piece + spark particles)
  const [decodingPieceId, setDecodingPieceId] = useState<number | null>(null);
  const [sparks, setSparks] = useState<SparkParticle[]>([]);

  // Completion sequence states
  const [isGlitchingComplete, setIsGlitchingComplete] = useState<boolean>(false);
  const [typedCompleteText, setTypedCompleteText] = useState<string>('');
  const isCompletedRef = useRef<boolean>(false);
  const hasSpokenHalfRef = useRef<boolean>(false);

  // Fake scrolling hex stream generator
  const hexReadout = useMemo(() => {
    const chars = ['0x4F', '0x8A', '0xC2', '0x19', '0x7E', '0x3B', '0xFA', '0x0D', '0x65', '0x9C'];
    return chars.join(' ');
  }, []);

  // Compute scale s = max(0.6, min(window.innerWidth*0.97 / 1280, window.innerHeight*0.97 / 720))
  const updateScale = useCallback(() => {
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    const s = Math.max(0.6, Math.min((ww * 0.97) / 1280, (wh * 0.97) / 720));
    setScale(s);
  }, []);

  useEffect(() => {
    updateScale();
    window.addEventListener('resize', updateScale);
    document.addEventListener('fullscreenchange', updateScale);
    return () => {
      window.removeEventListener('resize', updateScale);
      document.removeEventListener('fullscreenchange', updateScale);
    };
  }, [updateScale]);

  // 1. Procedurally generate the 600x360 source image once on offscreen canvas,
  // then slice the 10 puzzle pieces and prepare the always-on ghost guide
  useEffect(() => {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 600;
    sourceCanvas.height = 360;
    const ctx = sourceCanvas.getContext('2d');
    if (!ctx) return;

    if (panelId === 'hallway_panel_1') {
      // PICTURE 1: Simple family scene with 3 figures under a sun (600x360)
      const skyGrad = ctx.createLinearGradient(0, 0, 0, 360);
      skyGrad.addColorStop(0, '#fef9c3');
      skyGrad.addColorStop(0.65, '#fef08a');
      skyGrad.addColorStop(1, '#fed7aa');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, 600, 360);

      // Fluffy clouds
      ctx.fillStyle = '#ffffff';
      const drawCloud = (cx: number, cy: number, r: number) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.7, cy - r * 0.2, r * 0.8, 0, Math.PI * 2);
        ctx.arc(cx + r * 1.4, cy, r * 0.7, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.7, cy + r * 0.3, r * 0.6, 0, Math.PI * 2);
        ctx.fill();
      };
      drawCloud(70, 70, 26);
      drawCloud(220, 50, 20);

      // Bright smiling yellow sun with rays
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(520, 70, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#f59e0b';
      ctx.stroke();

      for (let i = 0; i < 12; i++) {
        const ang = (i * Math.PI) / 6;
        const x1 = 520 + Math.cos(ang) * 48;
        const y1 = 70 + Math.sin(ang) * 48;
        const x2 = 520 + Math.cos(ang) * 68;
        const y2 = 70 + Math.sin(ang) * 68;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Rolling green grass hills
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.moveTo(0, 240);
      ctx.quadraticCurveTo(160, 200, 340, 230);
      ctx.quadraticCurveTo(480, 255, 600, 215);
      ctx.lineTo(600, 360);
      ctx.lineTo(0, 360);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.moveTo(0, 270);
      ctx.quadraticCurveTo(240, 245, 420, 280);
      ctx.quadraticCurveTo(520, 295, 600, 270);
      ctx.lineTo(600, 360);
      ctx.lineTo(0, 360);
      ctx.closePath();
      ctx.fill();

      const drawFlower = (fx: number, fy: number, petColor: string) => {
        ctx.fillStyle = petColor;
        for (let p = 0; p < 5; p++) {
          const a = (p * Math.PI * 2) / 5;
          ctx.beginPath();
          ctx.arc(fx + Math.cos(a) * 8, fy + Math.sin(a) * 8, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(fx, fy, 5, 0, Math.PI * 2);
        ctx.fill();
      };
      drawFlower(90, 310, '#f43f5e');
      drawFlower(140, 330, '#a855f7');
      drawFlower(480, 315, '#f43f5e');
      drawFlower(540, 335, '#38bdf8');

      // Dad
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#1e293b';
      ctx.fillStyle = '#fed7aa';
      ctx.beginPath();
      ctx.arc(220, 140, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.arc(220, 130, 22, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(220, 143, 10, 0.2, Math.PI - 0.2);
      ctx.stroke();
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(213, 137, 3, 0, Math.PI * 2);
      ctx.arc(227, 137, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.roundRect(198, 162, 44, 60, 6);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(210, 222);
      ctx.lineTo(210, 280);
      ctx.moveTo(230, 222);
      ctx.lineTo(230, 280);
      ctx.stroke();

      // Mom
      ctx.fillStyle = '#fed7aa';
      ctx.beginPath();
      ctx.arc(295, 148, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#eab308';
      ctx.beginPath();
      ctx.arc(295, 140, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(295, 151, 9, 0.2, Math.PI - 0.2);
      ctx.stroke();
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(289, 145, 3, 0, Math.PI * 2);
      ctx.arc(301, 145, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.moveTo(295, 168);
      ctx.lineTo(270, 230);
      ctx.lineTo(320, 230);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(287, 230);
      ctx.lineTo(287, 280);
      ctx.moveTo(303, 230);
      ctx.lineTo(303, 280);
      ctx.stroke();

      // Zane
      ctx.fillStyle = '#fed7aa';
      ctx.beginPath();
      ctx.arc(365, 175, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#451a03';
      ctx.beginPath();
      ctx.arc(365, 168, 19, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(365, 178, 7, 0.2, Math.PI - 0.2);
      ctx.stroke();
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(360, 173, 2.5, 0, Math.PI * 2);
      ctx.arc(370, 173, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.roundRect(348, 193, 34, 45, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(365, 212, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(358, 238);
      ctx.lineTo(358, 285);
      ctx.moveTo(372, 238);
      ctx.lineTo(372, 285);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(242, 180);
      ctx.lineTo(275, 185);
      ctx.moveTo(315, 185);
      ctx.lineTo(348, 205);
      ctx.moveTo(198, 175);
      ctx.lineTo(178, 155);
      ctx.moveTo(382, 205);
      ctx.lineTo(402, 185);
      ctx.stroke();

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 16px "Share Tech Mono", monospace, sans-serif';
      ctx.fillText('OUR VACATION - ZANE', 30, 340);
    } else {
      // PICTURE 2: House with a tree and a big crayon spaceship (600x360)
      const skyGrad = ctx.createLinearGradient(0, 0, 600, 360);
      skyGrad.addColorStop(0, '#0284c7');
      skyGrad.addColorStop(0.5, '#4f46e5');
      skyGrad.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, 600, 360);

      ctx.fillStyle = '#fef08a';
      const drawStar = (sx: number, sy: number, sz: number) => {
        ctx.beginPath();
        ctx.arc(sx, sy, sz, 0, Math.PI * 2);
        ctx.fill();
      };
      drawStar(80, 50, 2);
      drawStar(140, 80, 3);
      drawStar(210, 40, 2);
      drawStar(310, 60, 3);
      drawStar(540, 40, 2.5);
      drawStar(570, 90, 2);

      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(80, 80, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(92, 74, 28, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.moveTo(0, 240);
      ctx.quadraticCurveTo(180, 215, 360, 250);
      ctx.quadraticCurveTo(500, 280, 600, 260);
      ctx.lineTo(600, 360);
      ctx.lineTo(0, 360);
      ctx.closePath();
      ctx.fill();

      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0f172a';
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(70, 185, 110, 95);
      ctx.strokeRect(70, 185, 110, 95);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(85, 130, 24, 40);
      ctx.strokeRect(85, 130, 24, 40);
      ctx.strokeStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(97, 115, 10, 0, Math.PI * 2);
      ctx.arc(107, 95, 14, 0, Math.PI * 2);
      ctx.arc(115, 70, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#0f172a';
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(55, 185);
      ctx.lineTo(125, 125);
      ctx.lineTo(195, 185);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#78350f';
      ctx.fillRect(105, 225, 35, 55);
      ctx.strokeRect(105, 225, 35, 55);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(145, 205, 25, 25);
      ctx.strokeRect(145, 205, 25, 25);

      ctx.fillStyle = '#78350f';
      ctx.fillRect(215, 200, 25, 80);
      ctx.strokeRect(215, 200, 25, 80);
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.arc(227, 165, 45, 0, Math.PI * 2);
      ctx.arc(195, 180, 32, 0, Math.PI * 2);
      ctx.arc(255, 180, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(210, 155, 5, 0, Math.PI * 2);
      ctx.arc(245, 160, 5, 0, Math.PI * 2);
      ctx.arc(225, 185, 5, 0, Math.PI * 2);
      ctx.fill();

      // Spaceship
      ctx.save();
      ctx.translate(430, 140);
      ctx.rotate(-0.35);
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(-75, -12);
      ctx.lineTo(-145, 0);
      ctx.lineTo(-75, 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(-75, -6);
      ctx.lineTo(-115, 0);
      ctx.lineTo(-75, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.ellipse(0, 0, 80, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(50, -22);
      ctx.quadraticCurveTo(95, 0, 105, 0);
      ctx.quadraticCurveTo(95, 0, 50, 22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.moveTo(-35, -25);
      ctx.lineTo(-65, -55);
      ctx.lineTo(-15, -27);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-35, 25);
      ctx.lineTo(-65, 55);
      ctx.lineTo(-15, 27);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(25, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(28, -4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(24, 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 16px "Share Tech Mono", monospace, sans-serif';
      ctx.fillText('COSMIC CRUISER MK-1', 30, 340);
    }

    ctx.lineWidth = 6;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeRect(0, 0, 600, 360);

    const fullUrl = sourceCanvas.toDataURL('image/png');
    setFullImageDataUrl(fullUrl);

    // Cut into 10 pieces (5 cols x 2 rows, 120x180 each)
    const pw = 120;
    const ph = 180;
    const initialPieces: PieceState[] = [];
    const saved = savedPuzzleProgress[panelId];

    // Safe area for loose pieces: 40 units from every edge (1280x720 stage -> x: 40 to 1120, y: 40 to 500)
    // Fragment Bay area: x: 50 to 480, y: 130 to 620
    const scatterSlots = [
      { x: 60, y: 130 },
      { x: 200, y: 130 },
      { x: 340, y: 130 },
      { x: 60, y: 320 },
      { x: 200, y: 320 },
      { x: 340, y: 320 },
      { x: 60, y: 510 },
      { x: 200, y: 510 },
      { x: 340, y: 510 },
      { x: 240, y: 510 },
    ];

    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        const id = row * 5 + col;
        const targetX = col * pw;
        const targetY = row * ph;

        const pCanvas = document.createElement('canvas');
        pCanvas.width = pw;
        pCanvas.height = ph;
        const pCtx = pCanvas.getContext('2d');
        if (pCtx) {
          pCtx.drawImage(sourceCanvas, col * pw, row * ph, pw, ph, 0, 0, pw, ph);
          pCtx.lineWidth = 1.5;
          pCtx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
          pCtx.strokeRect(0, 0, pw, ph);
        }

        const dataUrl = pCanvas.toDataURL('image/png');
        const isPlaced = saved?.placedIds?.includes(id) ?? false;

        let posX = boardX + targetX;
        let posY = boardY + targetY;
        let rot = 0;

        if (!isPlaced) {
          if (saved?.positions?.[id]) {
            posX = saved.positions[id].x;
            posY = saved.positions[id].y;
            rot = saved.positions[id].rotation || 0;
          } else {
            const slot = scatterSlots[id % scatterSlots.length];
            posX = slot.x + (Math.random() * 12 - 6);
            posY = slot.y + (Math.random() * 12 - 6);
            rot = (Math.random() - 0.5) * 12;
          }
          // Clamp loose pieces inside safe area (40 units from every edge)
          posX = Math.max(40, Math.min(1280 - pw - 40, posX));
          posY = Math.max(40, Math.min(720 - ph - 40, posY));
        }

        initialPieces.push({
          id,
          col,
          row,
          targetX,
          targetY,
          x: posX,
          y: posY,
          rotation: rot,
          isPlaced,
          dataUrl,
        });
      }
    }

    setPieces(initialPieces);
  }, [panelId]);

  // Handle ESC and holding 'R' key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'r' || e.key === 'R') {
        if (!e.repeat) {
          setIsRKeyDown(true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        setIsRKeyDown(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onClose]);

  // Particle burst update loop
  useEffect(() => {
    if (sparks.length === 0) return;
    const interval = setInterval(() => {
      setSparks((prev) =>
        prev
          .map((s) => ({
            ...s,
            x: s.x + s.vx,
            y: s.y + s.vy,
            life: s.life - 0.08,
          }))
          .filter((s) => s.life > 0)
      );
    }, 16);
    return () => clearInterval(interval);
  }, [sparks.length]);

  // Save current progress to memory
  const saveProgress = (currentPieces: PieceState[]) => {
    const placedIds = currentPieces.filter((p) => p.isPlaced).map((p) => p.id);
    const positions: Record<number, { x: number; y: number; rotation: number }> = {};
    currentPieces.forEach((p) => {
      positions[p.id] = { x: p.x, y: p.y, rotation: p.rotation };
    });
    savedPuzzleProgress[panelId] = { placedIds, positions };
  };

  // Drag start
  const handlePointerDown = (e: React.PointerEvent, piece: PieceState) => {
    if (piece.isPlaced || isCompletedRef.current || !stageRef.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const stageRect = stageRef.current.getBoundingClientRect();
    const stageX = (e.clientX - stageRect.left) / scale;
    const stageY = (e.clientY - stageRect.top) / scale;

    setActiveDragId(piece.id);
    dragOffsetRef.current = {
      x: stageX - piece.x,
      y: stageY - piece.y,
    };
  };

  // Drag move & Mouse Telemetry update in stage units
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!stageRef.current) return;
    const stageRect = stageRef.current.getBoundingClientRect();
    const stageX = (e.clientX - stageRect.left) / scale;
    const stageY = (e.clientY - stageRect.top) / scale;

    setMouseCoords({ x: Math.round(stageX), y: Math.round(stageY) });

    if (activeDragId === null) return;
    let newX = stageX - dragOffsetRef.current.x;
    let newY = stageY - dragOffsetRef.current.y;

    // Clamp inside safe area (40 units from every edge: width 1280 - 120 = 1160, height 720 - 180 = 540)
    newX = Math.max(40, Math.min(1280 - 120 - 40, newX));
    newY = Math.max(40, Math.min(720 - 180 - 40, newY));

    setPieces((prev) =>
      prev.map((p) => (p.id === activeDragId ? { ...p, x: newX, y: newY } : p))
    );
  };

  // Trigger spark particle burst on piece decode
  const triggerDecodeSparks = (cx: number, cy: number) => {
    const newSparks: SparkParticle[] = [];
    const colors = ['#00e5ff', '#38bdf8', '#f97316', '#ffffff', '#facc15'];
    for (let i = 0; i < 18; i++) {
      const ang = (i * Math.PI * 2) / 18 + (Math.random() - 0.5) * 0.4;
      const speed = 2.5 + Math.random() * 4.5;
      newSparks.push({
        id: Math.random(),
        x: cx,
        y: cy,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        size: 2 + Math.random() * 3,
        color: colors[i % colors.length],
        life: 1.0,
      });
    }
    setSparks((prev) => [...prev, ...newSparks]);
  };

  // Drag end / Snap detection
  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeDragId === null) return;
    const piece = pieces.find((p) => p.id === activeDragId);
    setActiveDragId(null);

    if (!piece || piece.isPlaced) return;

    const slotDesignX = boardX + piece.targetX;
    const slotDesignY = boardY + piece.targetY;

    // Check distance in stage units (snap distance 30 units)
    const pieceCenterX = piece.x + 60;
    const pieceCenterY = piece.y + 90;
    const slotCenterX = slotDesignX + 60;
    const slotCenterY = slotDesignY + 90;
    const dist = Math.hypot(pieceCenterX - slotCenterX, pieceCenterY - slotCenterY);

    if (dist <= 30) {
      soundEngine.playSoftClick();

      setDecodingPieceId(piece.id);
      triggerDecodeSparks(slotCenterX, slotCenterY);

      setTimeout(() => {
        setDecodingPieceId(null);
      }, 320);

      const nextPieces = pieces.map((p) =>
        p.id === piece.id
          ? {
              ...p,
              x: slotDesignX,
              y: slotDesignY,
              rotation: 0,
              isPlaced: true,
            }
          : p
      );

      setPieces(nextPieces);
      saveProgress(nextPieces);

      const placedCount = nextPieces.filter((p) => p.isPlaced).length;

      if (placedCount === 5 && !hasSpokenHalfRef.current) {
        hasSpokenHalfRef.current = true;
        onSubtitleChange('Zane', '“Almost.”');
        soundEngine.speakLine('Almost.', 'zane');
      }

      if (placedCount === 10 && !isCompletedRef.current) {
        isCompletedRef.current = true;
        soundEngine.playRadioStatic();
        setIsGlitchingComplete(true);

        const fullMsg = 'RECOVERY COMPLETE';
        let charIndex = 0;
        const typeInterval = setInterval(() => {
          charIndex++;
          setTypedCompleteText(fullMsg.slice(0, charIndex));
          if (charIndex >= fullMsg.length) {
            clearInterval(typeInterval);
            onSubtitleChange('Zane', '“There you are.”');
            soundEngine.speakLine('There you are.', 'zane');

            setTimeout(() => {
              onComplete(panelId);
            }, 950);
          }
        }, 38);
      }
    } else {
      saveProgress(pieces);
    }
  };

  const placedCount = pieces.filter((p) => p.isPlaced).length;
  const integrityPercent = placedCount * 10;

  const activeDraggedPiece = activeDragId !== null ? pieces.find((p) => p.id === activeDragId) : null;
  const isDraggedNearOwnSlot =
    Boolean(
      activeDraggedPiece &&
      !activeDraggedPiece.isPlaced &&
      Math.hypot(
        (activeDraggedPiece.x + 60) - (boardX + activeDraggedPiece.targetX + 60),
        (activeDraggedPiece.y + 90) - (boardY + activeDraggedPiece.targetY + 90)
      ) <= 30
    );

  const ghostOpacity = isRKeyDown ? 0.40 : 0.18;

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`fixed inset-0 z-50 flex items-center justify-center select-none overflow-hidden font-mono ${
        isGlitchingComplete ? 'animate-pulse' : ''
      }`}
      style={{
        backgroundColor: '#050b14',
        touchAction: 'none',
        fontFamily: "'Share Tech Mono', 'Chakra Petch', monospace",
      }}
    >
      {/* 1. Fullscreen Background Grid & CRT Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 50% 50%, rgba(6, 182, 212, 0.07) 0%, rgba(5, 11, 20, 0.95) 85%),
            linear-gradient(rgba(6, 182, 212, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6, 182, 212, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 32px 32px, 32px 32px',
          boxShadow: 'inset 0 0 160px rgba(0, 0, 0, 0.98), inset 0 0 50px rgba(0, 0, 0, 0.85)',
        }}
      />

      {/* 2. CRT Scanline Striping */}
      <div
        className="absolute inset-0 pointer-events-none opacity-25"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.35) 0px, rgba(0, 0, 0, 0.35) 2px, transparent 2px, transparent 4px)',
        }}
      />

      {/* 3. Screen Glitch Slice Overlays when Completed */}
      {isGlitchingComplete && (
        <div
          className="absolute inset-0 pointer-events-none z-50 mix-blend-screen opacity-70"
          style={{
            backgroundImage:
              'linear-gradient(90deg, rgba(255,0,0,0.15), rgba(0,255,255,0.2), rgba(0,0,255,0.15))',
            clipPath: 'polygon(0 15%, 100% 15%, 100% 35%, 0 35%, 0 70%, 100% 70%, 100% 88%, 0 88%)',
            transform: 'translateX(8px)',
          }}
        />
      )}

      {/* 4. ONE FIXED-SIZE STAGE OF 1280 x 720 DESIGN UNITS SCALED WITH CSS TRANSFORM */}
      <div
        ref={stageRef}
        className="relative w-[1280px] h-[720px] flex flex-col justify-between border border-cyan-500/60 bg-slate-950/95 p-6 shadow-[0_0_35px_rgba(6,182,212,0.15)]"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          clipPath:
            'polygon(0 14px, 14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px))',
        }}
      >
        {/* Micro-Corner Notches & Screws */}
        <div className="absolute top-2 left-2 text-[10px] text-cyan-500/40 select-none font-mono">◰ 0x01</div>
        <div className="absolute top-2 right-2 text-[10px] text-cyan-500/40 select-none font-mono">0x02 ◲</div>
        <div className="absolute bottom-2 left-2 text-[10px] text-cyan-500/40 select-none font-mono">◱ 0x03</div>
        <div className="absolute bottom-2 right-2 text-[10px] text-cyan-500/40 select-none font-mono">0x04 ◳</div>

        {/* Orange Hazard-Stripe Left & Right Flanges */}
        <div
          className="absolute top-0 bottom-0 left-0 w-2"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, #f97316 0px, #f97316 6px, #0f172a 6px, #0f172a 12px)',
          }}
        />
        <div
          className="absolute top-0 bottom-0 right-0 w-2"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, #f97316 0px, #f97316 6px, #0f172a 6px, #0f172a 12px)',
          }}
        />

        {/* --- HEADER STRIP --- */}
        <div className="w-full flex items-center justify-between border-b border-cyan-500/40 pb-3 px-3 z-40">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 border border-cyan-500/40 bg-cyan-950/40 text-cyan-300 text-xs">
              <span className="w-2.5 h-2.5 rounded-none bg-cyan-400 animate-ping inline-block" />
              <span className="font-bold tracking-widest text-sm">DATA FRAGMENT RECOVERY</span>
            </div>
            <div className="text-xs text-cyan-400/60 hidden sm:inline">
              SYS.REC // {panelId === 'hallway_panel_1' ? 'MEM_BANK_01' : 'MEM_BANK_02'}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-5 text-xs text-slate-400 tracking-wider">
            <div className="text-cyan-500/70 font-mono">
              <span className="text-orange-400 font-bold mr-1">HEX:</span>
              <span>{hexReadout}</span>
            </div>
            <div className="text-cyan-300 font-mono border-l border-cyan-500/30 pl-4">
              <span className="text-slate-400">X:</span> {Math.round(mouseCoords.x).toString().padStart(4, '0')}
              <span className="text-slate-400 ml-2">Y:</span> {Math.round(mouseCoords.y).toString().padStart(4, '0')}
            </div>
          </div>

          <div className="flex items-center gap-2 z-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider bg-slate-900 hover:bg-slate-800 text-cyan-300 hover:text-white border border-cyan-500/80 hover:border-orange-400 shadow-[0_0_12px_rgba(6,182,212,0.3)] active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer z-50"
              style={{
                clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)',
              }}
            >
              <span className="text-orange-400 font-bold">[ESC]</span>
              <span>ESC // RETURN</span>
            </button>
          </div>
        </div>

        {/* --- MAIN WORKSPACE --- */}
        <div className="relative w-full flex-1 flex items-start justify-between gap-6 py-4 px-2 overflow-hidden">
          {/* LEFT PANEL: Unaligned Fragment Bay (Width 460px, Height 540px) */}
          <div
            className="relative w-[460px] h-[540px] border border-cyan-500/40 bg-slate-950/80 p-4 flex flex-col justify-between shadow-inner"
            style={{
              clipPath:
                'polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px))',
            }}
          >
            <div className="flex items-center justify-between border-b border-cyan-500/30 pb-2 text-xs">
              <div className="flex items-center gap-1.5 text-cyan-300 font-bold tracking-wider">
                <span className="text-orange-400">❖</span>
                <span>FRAGMENT BAY</span>
              </div>
              <div className="text-xs text-slate-400">
                PENDING: <span className="text-orange-400 font-bold">{10 - placedCount}</span>/10
              </div>
            </div>

            <div
              className="absolute inset-x-4 top-12 bottom-16 pointer-events-none opacity-10"
              style={{
                backgroundImage:
                  'linear-gradient(to right, #00e5ff 1px, transparent 1px), linear-gradient(to bottom, #00e5ff 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />

            <div className="w-full border-t border-cyan-500/30 pt-2 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span className="text-cyan-400/90 font-bold">DRAG SHARD TO ALIGN</span>
              <span className={isRKeyDown ? 'text-cyan-300 font-bold' : 'text-slate-500'}>
                [HOLD R: 40% GHOST]
              </span>
            </div>
          </div>

          {/* RIGHT PANEL: Reconstruction Matrix Board & HUD */}
          <div className="relative flex flex-col items-center">
            <div className="w-[600px] flex items-center justify-between mb-2 px-1 text-xs">
              <div className="text-cyan-400 font-bold tracking-wider flex items-center gap-2">
                <span>RECONSTRUCTION MATRIX</span>
                <span className="text-xs text-slate-500 font-normal">[5x2 CELL GRID]</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-slate-400 text-xs">SIGNAL LOCK:</span>
                <span className="text-cyan-300 font-bold tracking-widest text-sm">
                  INTEGRITY {integrityPercent}%
                </span>
              </div>
            </div>

            {/* Target 600x360 Reconstruction Board at (560, 100) */}
            <div
              className="relative w-[600px] h-[360px] bg-slate-950 border border-cyan-500/70 shadow-[0_0_25px_rgba(6,182,212,0.12)] overflow-hidden"
            >
              <div className="absolute -top-1.5 -left-1.5 text-cyan-400 text-xs select-none z-20">⌜</div>
              <div className="absolute -top-1.5 -right-1.5 text-cyan-400 text-xs select-none z-20">⌝</div>
              <div className="absolute -bottom-1.5 -left-1.5 text-cyan-400 text-xs select-none z-20">⌞</div>
              <div className="absolute -bottom-1.5 -right-1.5 text-cyan-400 text-xs select-none z-20">⌟</div>

              {/* ALWAYS-ON GHOST GUIDE */}
              {fullImageDataUrl && (
                <div
                  className="absolute inset-0 pointer-events-none transition-opacity duration-150 z-0"
                  style={{ opacity: ghostOpacity }}
                >
                  <img
                    src={fullImageDataUrl}
                    alt="Background Blueprint Ghost Guide"
                    className="w-[600px] h-[360px] object-cover"
                    draggable={false}
                  />
                  <div
                    className="absolute inset-0 opacity-25"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(0deg, rgba(6,182,212,0.6) 0px, rgba(6,182,212,0.6) 1px, transparent 1px, transparent 4px)',
                    }}
                  />
                </div>
              )}

              {/* Board Cell Grid */}
              <div className="absolute inset-0 grid grid-cols-5 grid-rows-2 pointer-events-none z-10">
                {Array.from({ length: 10 }).map((_, i) => {
                  const isThisCellLit = isDraggedNearOwnSlot && activeDraggedPiece?.id === i;

                  return (
                    <div
                      key={i}
                      className={`relative border transition-all duration-100 flex flex-col justify-between p-1.5 ${
                        isThisCellLit
                          ? 'border-2 border-emerald-400 bg-emerald-500/20 shadow-[0_0_20px_rgba(52,211,153,0.8)] animate-pulse'
                          : 'border-cyan-500/20'
                      }`}
                    >
                      {isThisCellLit && (
                        <>
                          <div className="absolute top-0.5 left-0.5 text-emerald-300 text-[10px] font-bold">⌜</div>
                          <div className="absolute top-0.5 right-0.5 text-emerald-300 text-[10px] font-bold">⌝</div>
                          <div className="absolute bottom-0.5 left-0.5 text-emerald-300 text-[10px] font-bold">⌞</div>
                          <div className="absolute bottom-0.5 right-0.5 text-emerald-300 text-[10px] font-bold">⌟</div>
                          <div className="absolute top-1 right-1.5 px-1 py-0.2 bg-emerald-950/90 text-emerald-300 border border-emerald-400 text-[9px] font-bold font-mono tracking-widest animate-pulse">
                            LOCK
                          </div>
                        </>
                      )}

                      <span
                        className={`text-[9px] font-mono select-none ${
                          isThisCellLit ? 'text-emerald-300 font-bold' : 'text-cyan-500/35'
                        }`}
                      >
                        SEC.0{i + 1}
                      </span>
                      <span
                        className={`text-[8px] text-right font-mono select-none ${
                          isThisCellLit ? 'text-emerald-300 font-bold' : 'text-cyan-500/20'
                        }`}
                      >
                        {`0x${(i * 16 + 10).toString(16).toUpperCase()}`}
                      </span>
                    </div>
                  );
                })}
              </div>

              {isCompletedRef.current && (
                <div className="absolute inset-0 border-2 border-cyan-300 pointer-events-none shadow-[0_0_30px_rgba(6,182,212,0.8)] z-30" />
              )}
            </div>

            <div className="w-[600px] flex items-center justify-between mt-2 text-xs text-slate-400 font-mono px-1">
              <div>
                STREAM: <span className="text-cyan-400">DECRYPT_SYNC // ACTIVE</span>
              </div>
              <div>
                RECOVERED: <span className="text-orange-400 font-bold">{placedCount}</span> / 10 UNITS
              </div>
            </div>
          </div>
        </div>

        {/* --- FOOTER STATUS READOUT STRIP --- */}
        <div className="w-full border-t border-cyan-500/40 pt-2 px-3 flex items-center justify-between text-xs text-slate-400 font-mono z-40">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-slate-500">TERMINAL:</span> <span className="text-cyan-400">ZANE-NAV-99</span>
            </div>
            <div>
              <span className="text-slate-500">DECODE:</span>{' '}
              <span className={placedCount === 10 ? 'text-emerald-400 font-bold' : 'text-orange-400'}>
                {placedCount === 10 ? 'ALL PARITY VERIFIED' : 'SYNCING SHARDS...'}
              </span>
            </div>
          </div>

          <div className="text-slate-500 text-[11px]">
            [DRAG SHARDS TO ALIGN • HOLD [R] FOR 40% GHOST • ESC TO RETURN]
          </div>
        </div>

        {/* --- COMPLETION TYPEWRITER OVERLAY --- */}
        {isGlitchingComplete && (
          <div className="absolute inset-0 z-50 bg-black/75 flex flex-col items-center justify-center p-6">
            <div
              className="px-8 py-4 border-2 border-cyan-400 bg-slate-950 text-center shadow-[0_0_40px_rgba(6,182,212,0.6)]"
              style={{
                clipPath:
                  'polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px))',
              }}
            >
              <div className="text-xs text-orange-400 font-bold tracking-widest uppercase mb-1">
                SYSTEM RESTORATION CONFIRMED
              </div>
              <div className="text-2xl font-bold tracking-widest text-white font-mono flex items-center justify-center gap-1">
                <span>{typedCompleteText}</span>
                <span className="w-3 h-5 bg-cyan-400 animate-pulse" />
              </div>
              <div className="text-[11px] text-cyan-300/70 mt-2 font-mono">
                ALIGNING PHYSICAL HULL PANELS...
              </div>
            </div>
          </div>
        )}

        {/* --- SPARK PARTICLE BURSTS LAYER (Stage coordinates) --- */}
        {sparks.map((spark) => (
          <div
            key={spark.id}
            className="absolute rounded-none pointer-events-none z-50"
            style={{
              left: `${spark.x}px`,
              top: `${spark.y}px`,
              width: `${spark.size}px`,
              height: `${spark.size}px`,
              backgroundColor: spark.color,
              opacity: spark.life,
              boxShadow: `0 0 6px ${spark.color}`,
              transform: 'translate(-50%, -50%)',
            }}
          />
        ))}

        {/* --- PLACED & DRAGGABLE SHARDS LAYER (Absolute design units inside stage) --- */}
        {pieces.map((piece) => {
          const isDragging = activeDragId === piece.id;
          const isDecoding = decodingPieceId === piece.id;

          if (piece.isPlaced) {
            return (
              <div
                key={piece.id}
                className="absolute pointer-events-none select-none transition-all"
                style={{
                  left: `${piece.x}px`,
                  top: `${piece.y}px`,
                  width: '120px',
                  height: '180px',
                  zIndex: 20,
                  transform: 'rotate(0deg)',
                }}
              >
                <div
                  className={`relative w-full h-full border border-cyan-400/40 bg-slate-900 overflow-hidden ${
                    isDecoding
                      ? 'shadow-[0_0_24px_rgba(255,255,255,0.95)] border-white border-2'
                      : ''
                  }`}
                >
                  <img
                    src={piece.dataUrl}
                    alt={`Decoded Shard ${piece.id}`}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />

                  {isDecoding && (
                    <div
                      className="absolute inset-0 pointer-events-none bg-gradient-to-r from-transparent via-white to-transparent opacity-90 animate-pulse"
                      style={{
                        transform: 'skewX(-20deg)',
                      }}
                    />
                  )}

                  <div className="absolute top-1 right-1 text-[8px] bg-black/80 text-cyan-300 font-mono px-1 border border-cyan-500/40">
                    ✓
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={piece.id}
              onPointerDown={(e) => handlePointerDown(e, piece)}
              className={`absolute cursor-grab active:cursor-grabbing select-none transition-transform ${
                isDragging
                  ? 'z-50 scale-105 shadow-[0_0_25px_rgba(6,182,212,0.7),-3px_0_rgba(239,68,68,0.5),3px_0_rgba(6,182,212,0.5)]'
                  : 'z-30 hover:scale-[1.02] shadow-[0_4px_12px_rgba(0,0,0,0.8),-2px_0_rgba(239,68,68,0.4),2px_0_rgba(6,182,212,0.4)]'
              }`}
              style={{
                left: `${piece.x}px`,
                top: `${piece.y}px`,
                width: '120px',
                height: '180px',
                transform: `rotate(${isDragging ? piece.rotation * 0.3 : piece.rotation}deg)`,
              }}
            >
              <div
                className="relative w-full h-full border border-cyan-400/80 bg-slate-950 overflow-hidden"
                style={{
                  clipPath:
                    'polygon(0 6px, 6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px))',
                }}
              >
                <img
                  src={piece.dataUrl}
                  alt={`Corrupted Shard ${piece.id}`}
                  className="w-full h-full object-cover filter saturate-[0.6] brightness-90 contrast-110 pointer-events-none"
                  draggable={false}
                />

                <div
                  className="absolute inset-0 pointer-events-none opacity-35"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(0deg, rgba(6,182,212,0.8) 0px, rgba(6,182,212,0.8) 1.5px, transparent 1.5px, transparent 4px)',
                  }}
                />

                <div className="absolute top-1 left-1 text-[8px] bg-slate-950/90 text-cyan-300 font-mono px-1 border border-cyan-500/50">
                  SHARD #{piece.id.toString(16).toUpperCase().padStart(2, '0')}
                </div>

                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-orange-500" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
