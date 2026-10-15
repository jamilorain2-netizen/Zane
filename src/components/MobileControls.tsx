import React, { useState, useRef } from 'react';
import { motion, PanInfo } from 'motion/react';
import { MobileInputState } from '../types/game';

interface MobileControlsProps {
  onInput: (state: MobileInputState) => void;
  isInteractable: boolean;
}

export const MobileControls: React.FC<MobileControlsProps> = ({ onInput, isInteractable }) => {
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });

  const handleJoystickPan = (_: any, info: PanInfo) => {
    const maxDist = 50;
    const x = Math.max(-maxDist, Math.min(maxDist, info.offset.x));
    const y = Math.max(-maxDist, Math.min(maxDist, info.offset.y));
    setJoystickPos({ x, y });
    onInput({
      movement: { x: x / maxDist, y: -y / maxDist },
      look: { x: 0, y: 0 },
      jump: false,
      interact: false,
    });
  };

  const handleJoystickEnd = () => {
    setJoystickPos({ x: 0, y: 0 });
    onInput({ movement: { x: 0, y: 0 }, look: { x: 0, y: 0 }, jump: false, interact: false });
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      {/* Joystick Area */}
      <div className="absolute bottom-[20px] left-[20px] w-32 h-32 pointer-events-auto">
        <div className="w-full h-full rounded-full border-2 border-white/30 bg-white/10 flex items-center justify-center">
          <motion.div
            className="w-16 h-16 rounded-full bg-white/50"
            drag
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            dragElastic={0.1}
            onDrag={handleJoystickPan}
            onDragEnd={handleJoystickEnd}
            animate={{ x: joystickPos.x, y: joystickPos.y }}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="absolute bottom-[20px] right-[20px] flex flex-col gap-4 pointer-events-auto">
        <motion.button
          className="w-16 h-16 rounded-full bg-white/20 text-white font-bold backdrop-blur-sm border border-white/30"
          onPointerDown={() => onInput({ movement: { x: 0, y: 0 }, look: { x: 0, y: 0 }, jump: true, interact: false })}
          onPointerUp={() => onInput({ movement: { x: 0, y: 0 }, look: { x: 0, y: 0 }, jump: false, interact: false })}
        >
          A
        </motion.button>
        {isInteractable && (
          <motion.button
            className="w-20 h-20 rounded-full bg-yellow-500/50 text-white font-bold animate-pulse backdrop-blur-sm border border-yellow-300/30"
            onPointerDown={() => onInput({ movement: { x: 0, y: 0 }, look: { x: 0, y: 0 }, jump: false, interact: true })}
            onPointerUp={() => onInput({ movement: { x: 0, y: 0 }, look: { x: 0, y: 0 }, jump: false, interact: false })}
          >
            Search
          </motion.button>
        )}
      </div>

      {/* Look Drag Area */}
      <div
        className="absolute top-0 right-0 w-1/2 h-full pointer-events-auto"
        onPointerMove={(e) => {
          if (e.pointerType === 'touch' && e.buttons === 1) {
            onInput({
              movement: { x: 0, y: 0 },
              look: { x: e.movementX, y: e.movementY },
              jump: false,
              interact: false,
            });
          }
        }}
      />
    </div>
  );
};
