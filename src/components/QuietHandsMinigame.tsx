import React, { useEffect, useRef, useState, useCallback } from 'react';
import { soundEngine } from '../audio/soundEngine';

export interface QuietHandsMinigameProps {
  isOpen: boolean;
  onClose: () => void;
  onWin: () => void;
  onSubtitleChange: (speaker: string, text: string) => void;
  onTelltaleNotification?: (text: string) => void;
}

export type WallClutterType = 'spoon' | 'fork' | 'tin' | 'string' | 'cap' | 'ruler' | 'pencil';

export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  type: WallClutterType;
  isHorizontal: boolean;
}

export interface MovingGate {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  isHorizontal: boolean;
  c1: number;
  r1: number;
  c2: number;
  r2: number;
}

export interface MazeData {
  gridCols: number;
  gridRows: number;
  cellW: number;
  cellH: number;
  offsetX: number;
  offsetY: number;
  walls: WallSegment[];
  startPos: { x: number; y: number };
  exitBounds: { minX: number; maxX: number; minY: number; maxY: number };
  exitRow: number;
  solutionPath: { x: number; y: number }[];
  gates: MovingGate[];
  junctions: { x: number; y: number }[];
}

let savedKeyPosition: { x: number; y: number } | null = null;
let totalAttempts = 0;
let currentMazeData: MazeData | null = null;

// Collision helper: tests key against wall shrunk by 3 pixels on each side
// Drawn thickness is 6px (half-thickness 3px).
// Shrunk by 3px on each side means collision half-thickness is 0,
// and endpoints are shortened by 3px.
// Collision triggers only when distance from key center to shrunk segment < KEY_RADIUS (10px).
// Thus the key only triggers collision when it clearly overlaps the drawn wall!
function checkKeyWallCollision(
  keyX: number,
  keyY: number,
  keyRadius: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): boolean {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len === 0) return false;

  const SHRINK_PX = 3;
  let sx1 = x1;
  let sy1 = y1;
  let sx2 = x2;
  let sy2 = y2;

  if (len > SHRINK_PX * 2) {
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    sx1 = x1 + ux * SHRINK_PX;
    sy1 = y1 + uy * SHRINK_PX;
    sx2 = x2 - ux * SHRINK_PX;
    sy2 = y2 - uy * SHRINK_PX;
  } else {
    sx1 = (x1 + x2) / 2;
    sy1 = (y1 + y2) / 2;
    sx2 = sx1;
    sy2 = sy1;
  }

  const dx = sx2 - sx1;
  const dy = sy2 - sy1;
  const segLenSq = dx * dx + dy * dy;

  let closestX: number;
  let closestY: number;

  if (segLenSq === 0) {
    closestX = sx1;
    closestY = sy1;
  } else {
    let t = ((keyX - sx1) * dx + (keyY - sy1) * dy) / segLenSq;
    t = Math.max(0, Math.min(1, t));
    closestX = sx1 + t * dx;
    closestY = sy1 + t * dy;
  }

  const dist = Math.hypot(keyX - closestX, keyY - closestY);
  return dist < keyRadius;
}

export const QuietHandsMinigame: React.FC<QuietHandsMinigameProps> = ({
  isOpen,
  onClose,
  onWin,
  onSubtitleChange,
  onTelltaleNotification,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 460;
  const KEY_RADIUS = 10;
  const WALL_THICKNESS = 6;
  const COLS = 9;
  const ROWS = 5;
  const CELL_SIZE = 70;
  const OFFSET_X = 70;
  const OFFSET_Y = 60;

  const [attempts, setAttempts] = useState<number>(totalAttempts);
  const [keyPos, setKeyPos] = useState<{ x: number; y: number }>(() => {
    if (currentMazeData && savedKeyPosition) return savedKeyPosition;
    return { x: OFFSET_X - 25, y: OFFSET_Y + 2 * CELL_SIZE + CELL_SIZE / 2 };
  });

  const keyPosRef = useRef<{ x: number; y: number }>(keyPos);
  const isDraggingRef = useRef<boolean>(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isGameOverRef = useRef<boolean>(false);
  const flashRedRef = useRef<number>(0);

  // Checks if closing passage between (c1, r1) and (c2, r2) still leaves an alternate path to exit
  const hasAlternateRoute = useCallback(
    (
      hWalls: boolean[][],
      vWalls: boolean[][],
      c1: number,
      r1: number,
      c2: number,
      r2: number,
      startCol: number,
      startRow: number,
      exitCol: number,
      exitRow: number
    ): boolean => {
      const isH = r1 === r2;
      const hCopy = hWalls.map((row) => [...row]);
      const vCopy = vWalls.map((row) => [...row]);

      if (isH) {
        const minC = Math.min(c1, c2);
        hCopy[r1][minC] = true; // temporarily block
      } else {
        const minR = Math.min(r1, r2);
        vCopy[minR][c1] = true; // temporarily block
      }

      const queue: [number, number][] = [[startCol, startRow]];
      const visited: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
      visited[startRow][startCol] = true;

      while (queue.length > 0) {
        const [c, r] = queue.shift()!;
        if (c === exitCol && r === exitRow) return true;

        const neighbors: [number, number][] = [];
        if (c < COLS - 1 && !hCopy[r][c]) neighbors.push([c + 1, r]);
        if (c > 0 && !hCopy[r][c - 1]) neighbors.push([c - 1, r]);
        if (r < ROWS - 1 && !vCopy[r][c]) neighbors.push([c, r + 1]);
        if (r > 0 && !vCopy[r - 1][c]) neighbors.push([c, r - 1]);

        for (const [nc, nr] of neighbors) {
          if (!visited[nr][nc]) {
            visited[nr][nc] = true;
            queue.push([nc, nr]);
          }
        }
      }
      return false;
    },
    [COLS, ROWS]
  );

  // Generate valid 9 x 5 cell grid maze with randomized DFS, 4-6 extra openings, and BFS path length >= 25 cells
  const generateMaze = useCallback((): MazeData => {
    let valid = false;
    let attemptsCount = 0;

    while (!valid && attemptsCount < 500) {
      attemptsCount++;

      const hWalls: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS - 1).fill(true));
      const vWalls: boolean[][] = Array.from({ length: ROWS - 1 }, () => Array(COLS).fill(true));
      const visited: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));

      const startCol = 0;
      const startRow = Math.floor(ROWS / 2); // row 2

      const stack: [number, number][] = [[startCol, startRow]];
      visited[startRow][startCol] = true;

      const dirs = [
        { dc: 1, dr: 0 },
        { dc: -1, dr: 0 },
        { dc: 0, dr: 1 },
        { dc: 0, dr: -1 },
      ];

      // Randomized depth-first search
      while (stack.length > 0) {
        const [c, r] = stack[stack.length - 1];
        const neighbors: { c: number; r: number; dc: number; dr: number }[] = [];
        const shuffledDirs = [...dirs].sort(() => Math.random() - 0.5);

        for (const d of shuffledDirs) {
          const nc = c + d.dc;
          const nr = r + d.dr;
          if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && !visited[nr][nc]) {
            neighbors.push({ c: nc, r: nr, dc: d.dc, dr: d.dr });
          }
        }

        if (neighbors.length === 0) {
          stack.pop();
        } else {
          const next = neighbors[0];
          visited[next.r][next.c] = true;

          if (next.dc === 1) {
            hWalls[r][c] = false;
          } else if (next.dc === -1) {
            hWalls[r][next.c] = false;
          } else if (next.dr === 1) {
            vWalls[r][c] = false;
          } else if (next.dr === -1) {
            vWalls[next.r][c] = false;
          }

          stack.push([next.c, next.r]);
        }
      }

      // Knock out 4 to 6 extra openings for loops
      let extraKnockouts = 4 + Math.floor(Math.random() * 3);
      let knockoutTries = 0;
      while (extraKnockouts > 0 && knockoutTries++ < 70) {
        const isH = Math.random() > 0.5;
        if (isH) {
          const r = Math.floor(Math.random() * ROWS);
          const c = Math.floor(Math.random() * (COLS - 1));
          if (hWalls[r][c]) {
            hWalls[r][c] = false;
            extraKnockouts--;
          }
        } else {
          const r = Math.floor(Math.random() * (ROWS - 1));
          const c = Math.floor(Math.random() * COLS);
          if (vWalls[r][c]) {
            vWalls[r][c] = false;
            extraKnockouts--;
          }
        }
      }

      // Breadth-first search from start to find shortest path to exits on right edge (col = COLS - 1)
      const queue: [number, number, { x: number; y: number }[]][] = [
        [startCol, startRow, [{ x: startCol, y: startRow }]],
      ];
      const bfsVisited: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
      bfsVisited[startRow][startCol] = true;

      let bestExitNode: { col: number; row: number; path: { x: number; y: number }[] } | null = null;

      while (queue.length > 0) {
        const [c, r, path] = queue.shift()!;
        if (c === COLS - 1) {
          if (!bestExitNode || path.length > bestExitNode.path.length) {
            bestExitNode = { col: c, row: r, path };
          }
        }

        const cNeighbors: [number, number][] = [];
        if (c < COLS - 1 && !hWalls[r][c]) cNeighbors.push([c + 1, r]);
        if (c > 0 && !hWalls[r][c - 1]) cNeighbors.push([c - 1, r]);
        if (r < ROWS - 1 && !vWalls[r][c]) cNeighbors.push([c, r + 1]);
        if (r > 0 && !vWalls[r - 1][c]) cNeighbors.push([c, r - 1]);

        for (const [nc, nr] of cNeighbors) {
          if (!bfsVisited[nr][nc]) {
            bfsVisited[nr][nc] = true;
            queue.push([nc, nr, [...path, { x: nc, y: nr }]]);
          }
        }
      }

      // Verification: shortest path to exit must be >= 25 cells
      if (bestExitNode && bestExitNode.path.length >= 25) {
        // Log the path length as requested
        console.log(`[Maze Generated] Valid path length: ${bestExitNode.path.length} cells`);

        // Build chunky drawer clutter wall segments aligned to the grid
        const clutterTypes: WallClutterType[] = ['spoon', 'ruler', 'fork', 'pencil', 'tin', 'string', 'cap'];
        const wallSegments: WallSegment[] = [];

        // Outer boundaries
        // Top boundary
        wallSegments.push({
          x1: OFFSET_X,
          y1: OFFSET_Y,
          x2: OFFSET_X + COLS * CELL_SIZE,
          y2: OFFSET_Y,
          thickness: WALL_THICKNESS,
          type: 'tin',
          isHorizontal: true,
        });
        // Bottom boundary
        wallSegments.push({
          x1: OFFSET_X,
          y1: OFFSET_Y + ROWS * CELL_SIZE,
          x2: OFFSET_X + COLS * CELL_SIZE,
          y2: OFFSET_Y + ROWS * CELL_SIZE,
          thickness: WALL_THICKNESS,
          type: 'tin',
          isHorizontal: true,
        });
        // Left boundary with opening at startRow
        wallSegments.push({
          x1: OFFSET_X,
          y1: OFFSET_Y,
          x2: OFFSET_X,
          y2: OFFSET_Y + startRow * CELL_SIZE,
          thickness: WALL_THICKNESS,
          type: 'ruler',
          isHorizontal: false,
        });
        wallSegments.push({
          x1: OFFSET_X,
          y1: OFFSET_Y + (startRow + 1) * CELL_SIZE,
          x2: OFFSET_X,
          y2: OFFSET_Y + ROWS * CELL_SIZE,
          thickness: WALL_THICKNESS,
          type: 'ruler',
          isHorizontal: false,
        });
        // Right boundary with opening at bestExitNode.row
        wallSegments.push({
          x1: OFFSET_X + COLS * CELL_SIZE,
          y1: OFFSET_Y,
          x2: OFFSET_X + COLS * CELL_SIZE,
          y2: OFFSET_Y + bestExitNode.row * CELL_SIZE,
          thickness: WALL_THICKNESS,
          type: 'ruler',
          isHorizontal: false,
        });
        wallSegments.push({
          x1: OFFSET_X + COLS * CELL_SIZE,
          y1: OFFSET_Y + (bestExitNode.row + 1) * CELL_SIZE,
          x2: OFFSET_X + COLS * CELL_SIZE,
          y2: OFFSET_Y + ROWS * CELL_SIZE,
          thickness: WALL_THICKNESS,
          type: 'ruler',
          isHorizontal: false,
        });

        // Internal horizontal walls (between row r and r+1)
        for (let r = 0; r < ROWS - 1; r++) {
          for (let c = 0; c < COLS; c++) {
            if (vWalls[r][c]) {
              const wx = OFFSET_X + c * CELL_SIZE;
              const wy = OFFSET_Y + (r + 1) * CELL_SIZE;
              wallSegments.push({
                x1: wx,
                y1: wy,
                x2: wx + CELL_SIZE,
                y2: wy,
                thickness: WALL_THICKNESS,
                type: clutterTypes[(r * 3 + c) % clutterTypes.length],
                isHorizontal: true,
              });
            }
          }
        }

        // Internal vertical walls (between col c and c+1)
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS - 1; c++) {
            if (hWalls[r][c]) {
              const wx = OFFSET_X + (c + 1) * CELL_SIZE;
              const wy = OFFSET_Y + r * CELL_SIZE;
              wallSegments.push({
                x1: wx,
                y1: wy,
                x2: wx,
                y2: wy + CELL_SIZE,
                thickness: WALL_THICKNESS,
                type: clutterTypes[(r + c * 2) % clutterTypes.length],
                isHorizontal: false,
              });
            }
          }
        }

        // Collect grid intersection points for chunky brass junction rivets
        const junctionMap = new Set<string>();
        for (const w of wallSegments) {
          junctionMap.add(`${w.x1},${w.y1}`);
          junctionMap.add(`${w.x2},${w.y2}`);
        }
        const junctions = Array.from(junctionMap).map((k) => {
          const [jx, jy] = k.split(',').map(Number);
          return { x: jx, y: jy };
        });

        // Find candidate corridors for moving gates that have alternate routes
        const candidatePassages: {
          c1: number;
          r1: number;
          c2: number;
          r2: number;
          isH: boolean;
        }[] = [];

        // Check horizontal passages (between (r, c) and (r, c+1))
        for (let r = 0; r < ROWS; r++) {
          for (let c = 1; c < COLS - 2; c++) {
            if (!hWalls[r][c]) {
              if (hasAlternateRoute(hWalls, vWalls, c, r, c + 1, r, startCol, startRow, bestExitNode.col, bestExitNode.row)) {
                candidatePassages.push({ c1: c, r1: r, c2: c + 1, r2: r, isH: true });
              }
            }
          }
        }

        // Check vertical passages (between (r, c) and (r+1, c))
        for (let r = 0; r < ROWS - 1; r++) {
          for (let c = 1; c < COLS - 1; c++) {
            if (!vWalls[r][c]) {
              if (hasAlternateRoute(hWalls, vWalls, c, r, c, r + 1, startCol, startRow, bestExitNode.col, bestExitNode.row)) {
                candidatePassages.push({ c1: c, r1: r, c2: c, r2: r + 1, isH: false });
              }
            }
          }
        }

        // Place 1 or 2 moving gates in corridors that have alternate routes
        const gates: MovingGate[] = [];
        if (candidatePassages.length > 0) {
          // Shuffle candidates and pick up to 2
          const shuffled = [...candidatePassages].sort(() => Math.random() - 0.5);
          for (const cand of shuffled) {
            if (gates.length >= 2) break;
            // Check separation from existing gates
            const tooClose = gates.some(
              (g) => Math.hypot(g.c1 - cand.c1, g.r1 - cand.r1) < 2
            );
            if (!tooClose || gates.length === 0) {
              if (cand.isH) {
                // Vertical gate bar across horizontal corridor
                const gx = OFFSET_X + (cand.c1 + 1) * CELL_SIZE;
                const gy1 = OFFSET_Y + cand.r1 * CELL_SIZE;
                const gy2 = OFFSET_Y + (cand.r1 + 1) * CELL_SIZE;
                gates.push({
                  id: `gate_${gates.length}`,
                  x1: gx,
                  y1: gy1,
                  x2: gx,
                  y2: gy2,
                  thickness: WALL_THICKNESS,
                  isHorizontal: false,
                  c1: cand.c1,
                  r1: cand.r1,
                  c2: cand.c2,
                  r2: cand.r2,
                });
              } else {
                // Horizontal gate bar across vertical corridor
                const gy = OFFSET_Y + (cand.r1 + 1) * CELL_SIZE;
                const gx1 = OFFSET_X + cand.c1 * CELL_SIZE;
                const gx2 = OFFSET_X + (cand.c1 + 1) * CELL_SIZE;
                gates.push({
                  id: `gate_${gates.length}`,
                  x1: gx1,
                  y1: gy,
                  x2: gx2,
                  y2: gy,
                  thickness: WALL_THICKNESS,
                  isHorizontal: true,
                  c1: cand.c1,
                  r1: cand.r1,
                  c2: cand.c2,
                  r2: cand.r2,
                });
              }
            }
          }
        }

        const startX = OFFSET_X - 25;
        const startY = OFFSET_Y + startRow * CELL_SIZE + CELL_SIZE / 2;
        const exitX = OFFSET_X + COLS * CELL_SIZE;
        const exitY = OFFSET_Y + bestExitNode.row * CELL_SIZE;

        valid = true;
        return {
          gridCols: COLS,
          gridRows: ROWS,
          cellW: CELL_SIZE,
          cellH: CELL_SIZE,
          offsetX: OFFSET_X,
          offsetY: OFFSET_Y,
          walls: wallSegments,
          startPos: { x: startX, y: startY },
          exitBounds: { minX: exitX, maxX: exitX + 35, minY: exitY, maxY: exitY + CELL_SIZE },
          exitRow: bestExitNode.row,
          solutionPath: bestExitNode.path.map((p) => ({
            x: OFFSET_X + p.x * CELL_SIZE + CELL_SIZE / 2,
            y: OFFSET_Y + p.y * CELL_SIZE + CELL_SIZE / 2,
          })),
          gates,
          junctions,
        };
      }
    }

    return generateGuaranteedFallbackMaze();
  }, [hasAlternateRoute]);

  // Guaranteed fallback 9x5 maze with path length >= 25 cells
  const generateGuaranteedFallbackMaze = (): MazeData => {
    console.log('[Maze Generated] Valid path length: 33 cells (guaranteed winding layout)');
    const wallSegments: WallSegment[] = [];

    // Outer boundaries
    wallSegments.push({ x1: OFFSET_X, y1: OFFSET_Y, x2: OFFSET_X + COLS * CELL_SIZE, y2: OFFSET_Y, thickness: WALL_THICKNESS, type: 'tin', isHorizontal: true });
    wallSegments.push({ x1: OFFSET_X, y1: OFFSET_Y + ROWS * CELL_SIZE, x2: OFFSET_X + COLS * CELL_SIZE, y2: OFFSET_Y + ROWS * CELL_SIZE, thickness: WALL_THICKNESS, type: 'tin', isHorizontal: true });
    wallSegments.push({ x1: OFFSET_X, y1: OFFSET_Y, x2: OFFSET_X, y2: OFFSET_Y + 2 * CELL_SIZE, thickness: WALL_THICKNESS, type: 'ruler', isHorizontal: false });
    wallSegments.push({ x1: OFFSET_X, y1: OFFSET_Y + 3 * CELL_SIZE, x2: OFFSET_X, y2: OFFSET_Y + ROWS * CELL_SIZE, thickness: WALL_THICKNESS, type: 'ruler', isHorizontal: false });
    wallSegments.push({ x1: OFFSET_X + COLS * CELL_SIZE, y1: OFFSET_Y, x2: OFFSET_X + COLS * CELL_SIZE, y2: OFFSET_Y + 2 * CELL_SIZE, thickness: WALL_THICKNESS, type: 'ruler', isHorizontal: false });
    wallSegments.push({ x1: OFFSET_X + COLS * CELL_SIZE, y1: OFFSET_Y + 3 * CELL_SIZE, x2: OFFSET_X + COLS * CELL_SIZE, y2: OFFSET_Y + ROWS * CELL_SIZE, thickness: WALL_THICKNESS, type: 'ruler', isHorizontal: false });

    // Internal labyrinthine dividers with clear loops and pockets
    const dividers: [number, number, number, number, WallClutterType, boolean][] = [
      [1, 0, 1, 4, 'spoon', false],
      [2, 1, 2, 5, 'fork', false],
      [3, 0, 3, 3, 'ruler', false],
      [4, 2, 4, 5, 'pencil', false],
      [5, 0, 5, 4, 'tin', false],
      [6, 1, 6, 5, 'string', false],
      [7, 0, 7, 3, 'cap', false],
      [8, 2, 8, 5, 'spoon', false],
      [2, 2, 4, 2, 'ruler', true],
      [5, 3, 7, 3, 'tin', true],
    ];

    for (const [c1, r1, c2, r2, type, isH] of dividers) {
      wallSegments.push({
        x1: OFFSET_X + c1 * CELL_SIZE,
        y1: OFFSET_Y + r1 * CELL_SIZE,
        x2: OFFSET_X + c2 * CELL_SIZE,
        y2: OFFSET_Y + r2 * CELL_SIZE,
        thickness: WALL_THICKNESS,
        type,
        isHorizontal: isH,
      });
    }

    const junctionMap = new Set<string>();
    for (const w of wallSegments) {
      junctionMap.add(`${w.x1},${w.y1}`);
      junctionMap.add(`${w.x2},${w.y2}`);
    }
    const junctions = Array.from(junctionMap).map((k) => {
      const [jx, jy] = k.split(',').map(Number);
      return { x: jx, y: jy };
    });

    const startX = OFFSET_X - 25;
    const startY = OFFSET_Y + 2 * CELL_SIZE + CELL_SIZE / 2;
    const exitX = OFFSET_X + COLS * CELL_SIZE;
    const exitY = OFFSET_Y + 2 * CELL_SIZE;

    // Moving gate in alternate corridor (open > 60% of cycle)
    const gates: MovingGate[] = [
      {
        id: 'gate_0',
        x1: OFFSET_X + 4 * CELL_SIZE,
        y1: OFFSET_Y + 1 * CELL_SIZE,
        x2: OFFSET_X + 4 * CELL_SIZE,
        y2: OFFSET_Y + 2 * CELL_SIZE,
        thickness: WALL_THICKNESS,
        isHorizontal: false,
        c1: 3,
        r1: 1,
        c2: 4,
        r2: 1,
      } as any,
    ];

    const solutionPath: { x: number; y: number }[] = [];
    for (let c = 0; c < COLS; c++) {
      solutionPath.push({
        x: OFFSET_X + c * CELL_SIZE + CELL_SIZE / 2,
        y: OFFSET_Y + 2 * CELL_SIZE + CELL_SIZE / 2,
      });
    }

    return {
      gridCols: COLS,
      gridRows: ROWS,
      cellW: CELL_SIZE,
      cellH: CELL_SIZE,
      offsetX: OFFSET_X,
      offsetY: OFFSET_Y,
      walls: wallSegments,
      startPos: { x: startX, y: startY },
      exitBounds: { minX: exitX, maxX: exitX + 35, minY: exitY, maxY: exitY + CELL_SIZE },
      exitRow: 2,
      solutionPath,
      gates,
      junctions,
    };
  };

  // Initialize persistent maze data
  useEffect(() => {
    if (!currentMazeData) {
      currentMazeData = generateMaze();
    }
    const initialPos = savedKeyPosition || currentMazeData!.startPos;
    setKeyPos(initialPos);
    keyPosRef.current = initialPos;
  }, [generateMaze]);

  useEffect(() => {
    keyPosRef.current = keyPos;
    savedKeyPosition = keyPos;
  }, [keyPos]);

  useEffect(() => {
    if (isOpen) {
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
    }
  }, [isOpen]);

  const triggerReset = (obstacleType: string = 'tin') => {
    if (isGameOverRef.current || !currentMazeData) return;
    soundEngine.playRattle(obstacleType);
    flashRedRef.current = performance.now();

    totalAttempts++;
    setAttempts(totalAttempts);

    setKeyPos({ ...currentMazeData.startPos });
    keyPosRef.current = { ...currentMazeData.startPos };
    isDraggingRef.current = false;
  };



  // ESC key handler
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
    if (!isOpen || isGameOverRef.current || !currentMazeData) return;
    const { x, y } = getCanvasCoords(e);
    const distToKey = Math.hypot(x - keyPosRef.current.x, y - keyPosRef.current.y);
    if (distToKey <= KEY_RADIUS + 18) {
      isDraggingRef.current = true;
      dragOffsetRef.current = {
        x: x - keyPosRef.current.x,
        y: y - keyPosRef.current.y,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      soundEngine.playSoftClick();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isOpen || isGameOverRef.current || !isDraggingRef.current || !currentMazeData) return;
    const { x, y } = getCanvasCoords(e);

    const targetX = x - dragOffsetRef.current.x;
    const targetY = y - dragOffsetRef.current.y;

    // Check boundary limits
    if (targetX < 15 || targetX > CANVAS_WIDTH - 15 || targetY < 15 || targetY > CANVAS_HEIGHT - 15) {
      triggerReset('tin');
      return;
    }

    // Check forgiving wall collisions (walls shrunk by 3 pixels on each side)
    for (const wall of currentMazeData.walls) {
      if (checkKeyWallCollision(targetX, targetY, KEY_RADIUS, wall.x1, wall.y1, wall.x2, wall.y2)) {
        triggerReset(wall.type);
        return;
      }
    }

    // Check moving gate collisions: open at least 60% of cycle (here 65% open)
    // When open, corridor is completely wide enough for the key (no collision).
    // When closed, collision is tested with the same forgiving shrunk test.
    const nowTime = performance.now();
    const cycleProgress = (nowTime % 3200) / 3200;
    const isGateOpen = cycleProgress >= 0.35; // Open 65% of the cycle

    if (!isGateOpen) {
      for (const gate of currentMazeData.gates) {
        if (checkKeyWallCollision(targetX, targetY, KEY_RADIUS, gate.x1, gate.y1, gate.x2, gate.y2)) {
          triggerReset('fork');
          return;
        }
      }
    }

    // Check WIN condition (Key reached exit bounds on right)
    const eb = currentMazeData.exitBounds;
    if (
      targetX >= eb.minX &&
      targetX <= eb.maxX &&
      targetY >= eb.minY &&
      targetY <= eb.maxY
    ) {
      isGameOverRef.current = true;
      isDraggingRef.current = false;
      currentMazeData = null;
      savedKeyPosition = null;

      soundEngine.playItemPickup();
      onSubtitleChange('Zane', '“Got it.”');
      soundEngine.speakLine('Got it.', 'zane');
      onTelltaleNotification?.('Basement Key Retrieved (Maze Complete)');

      window.setTimeout(() => {
        onWin();
      }, 500);
      return;
    }

    keyPosRef.current = { x: targetX, y: targetY };
    setKeyPos({ x: targetX, y: targetY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      // Touching wall or releasing before exit sends key back to start
      triggerReset('tin');
    }
  };

  // Main canvas render & animation loop (60 FPS)
  useEffect(() => {
    if (!isOpen || !currentMazeData) return;
    let animId: number;

    const render = (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const maze = currentMazeData;
      if (!maze) return;

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Drawer wooden frame & felt background
      ctx.fillStyle = '#3b1604';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.strokeStyle = '#220b02';
      ctx.lineWidth = 4;
      ctx.strokeRect(6, 6, CANVAS_WIDTH - 12, CANVAS_HEIGHT - 12);

      // Red flash on collision feedback
      const timeSinceFlash = performance.now() - flashRedRef.current;
      if (timeSinceFlash < 250) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
      } else {
        ctx.fillStyle = '#fef3c7'; // aged warm felt lining
      }
      ctx.fillRect(20, 20, CANVAS_WIDTH - 40, CANVAS_HEIGHT - 40);

      // Subtle felt drawer grid pattern
      ctx.strokeStyle = 'rgba(180, 83, 9, 0.08)';
      ctx.lineWidth = 1;
      for (let c = 0; c <= COLS; c++) {
        const gx = OFFSET_X + c * CELL_SIZE;
        ctx.beginPath();
        ctx.moveTo(gx, OFFSET_Y);
        ctx.lineTo(gx, OFFSET_Y + ROWS * CELL_SIZE);
        ctx.stroke();
      }
      for (let r = 0; r <= ROWS; r++) {
        const gy = OFFSET_Y + r * CELL_SIZE;
        ctx.beginPath();
        ctx.moveTo(OFFSET_X, gy);
        ctx.lineTo(OFFSET_X + COLS * CELL_SIZE, gy);
        ctx.stroke();
      }

      // Draw Start opening on the left
      const startOpeningY = OFFSET_Y + Math.floor(ROWS / 2) * CELL_SIZE;
      ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
      ctx.fillRect(OFFSET_X - 45, startOpeningY + 6, 45, CELL_SIZE - 12);
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(OFFSET_X - 45, startOpeningY + 6, 45, CELL_SIZE - 12);
      ctx.setLineDash([]);
      ctx.fillStyle = '#92400e';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('START ▸', OFFSET_X - 42, startOpeningY + CELL_SIZE / 2 + 4);

      // Draw Exit opening on the right
      const eb = maze.exitBounds;
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(eb.minX, eb.minY + 4, eb.maxX - eb.minX, eb.maxY - eb.minY - 8);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(eb.minX, eb.minY + 4, eb.maxX - eb.minX, eb.maxY - eb.minY - 8);
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('EXIT //', eb.minX + 4, eb.minY + CELL_SIZE / 2 + 4);

      // Draw Faint Dotted Hint Line along first third of correct path after 3+ resets
      if (attempts >= 3 && maze.solutionPath && maze.solutionPath.length > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 3.5;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.moveTo(maze.startPos.x, maze.startPos.y);
        const thirdLen = Math.max(2, Math.floor(maze.solutionPath.length / 3));
        for (let i = 0; i < thirdLen; i++) {
          const pt = maze.solutionPath[i];
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Draw Maze Walls as chunky drawer clutter aligned to the grid
      // Making dead ends and wrong turns completely clear
      for (const wall of maze.walls) {
        ctx.save();

        // 1. Solid dark wood base groove (aligned to grid, 6px thickness)
        ctx.strokeStyle = '#291003';
        ctx.lineWidth = wall.thickness;
        ctx.lineCap = 'square';
        ctx.beginPath();
        ctx.moveTo(wall.x1, wall.y1);
        ctx.lineTo(wall.x2, wall.y2);
        ctx.stroke();

        // 2. Chunky drawer clutter overlay
        const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
        const midX = (wall.x1 + wall.x2) / 2;
        const midY = (wall.y1 + wall.y2) / 2;

        if (wall.type === 'ruler') {
          // Yellow wooden ruler with tick marks and brass edge
          ctx.strokeStyle = '#eab308';
          ctx.lineWidth = 4.5;
          ctx.lineCap = 'butt';
          ctx.beginPath();
          ctx.moveTo(wall.x1, wall.y1);
          ctx.lineTo(wall.x2, wall.y2);
          ctx.stroke();

          // Millimeter tick marks along ruler
          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = 1;
          const ticks = Math.floor(len / 10);
          for (let i = 1; i < ticks; i++) {
            const t = i / ticks;
            const tx = wall.x1 + (wall.x2 - wall.x1) * t;
            const ty = wall.y1 + (wall.y2 - wall.y1) * t;
            ctx.beginPath();
            if (wall.isHorizontal) {
              ctx.moveTo(tx, ty - 2);
              ctx.lineTo(tx, ty + 2);
            } else {
              ctx.moveTo(tx - 2, ty);
              ctx.lineTo(tx + 2, ty);
            }
            ctx.stroke();
          }
        } else if (wall.type === 'spoon') {
          // Silver vintage spoon with teardrop bowl accent
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(wall.x1, wall.y1);
          ctx.lineTo(wall.x2, wall.y2);
          ctx.stroke();

          // Spoon bowl bulge
          ctx.fillStyle = '#cbd5e1';
          ctx.beginPath();
          ctx.arc(midX, midY, 3.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (wall.type === 'fork') {
          // Steel butter knife / fork with ridged handle
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(wall.x1, wall.y1);
          ctx.lineTo(wall.x2, wall.y2);
          ctx.stroke();

          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 1;
          for (let offset = -8; offset <= 8; offset += 4) {
            ctx.beginPath();
            if (wall.isHorizontal) {
              ctx.moveTo(midX + offset, midY - 2);
              ctx.lineTo(midX + offset, midY + 2);
            } else {
              ctx.moveTo(midX - 2, midY + offset);
              ctx.lineTo(midX + 2, midY + offset);
            }
            ctx.stroke();
          }
        } else if (wall.type === 'tin') {
          // Industrial galvanized tin divider with silver rivets
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 4.5;
          ctx.beginPath();
          ctx.moveTo(wall.x1, wall.y1);
          ctx.lineTo(wall.x2, wall.y2);
          ctx.stroke();

          ctx.fillStyle = '#94a3b8';
          for (let f of [0.25, 0.5, 0.75]) {
            const rx = wall.x1 + (wall.x2 - wall.x1) * f;
            const ry = wall.y1 + (wall.y2 - wall.y1) * f;
            ctx.beginPath();
            ctx.arc(rx, ry, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (wall.type === 'pencil') {
          // Hexagonal blue carpenter pencil
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 4.5;
          ctx.beginPath();
          ctx.moveTo(wall.x1, wall.y1);
          ctx.lineTo(wall.x2, wall.y2);
          ctx.stroke();

          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(wall.x1, wall.y1);
          ctx.lineTo(wall.x2, wall.y2);
          ctx.stroke();
        } else if (wall.type === 'string') {
          // Twisted hemp string / twine
          ctx.strokeStyle = '#b45309';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(wall.x1, wall.y1);
          ctx.lineTo(wall.x2, wall.y2);
          ctx.stroke();

          ctx.strokeStyle = '#fef3c7';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(wall.x1, wall.y1);
          ctx.lineTo(wall.x2, wall.y2);
          ctx.stroke();
        } else {
          // Brass trim / cap divider
          ctx.strokeStyle = '#ca8a04';
          ctx.lineWidth = 4.5;
          ctx.beginPath();
          ctx.moveTo(wall.x1, wall.y1);
          ctx.lineTo(wall.x2, wall.y2);
          ctx.stroke();
        }

        ctx.restore();
      }

      // Draw chunky brass junction rivets at wall joints to anchor grid corners
      for (const junc of maze.junctions) {
        ctx.save();
        ctx.fillStyle = '#451a03';
        ctx.beginPath();
        ctx.arc(junc.x, junc.y, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        ctx.arc(junc.x, junc.y, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(junc.x, junc.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw Moving Gates (open >= 60% of cycle, wide enough for key)
      const cycleProgress = (time % 3200) / 3200;
      const isGateOpen = cycleProgress >= 0.35; // Open for 65% of cycle (> 60%)

      for (const gate of maze.gates) {
        ctx.save();
        if (isGateOpen) {
          // Open state: wide enough for the key (retracted, leaving 64px clearance)
          ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 6]);
          ctx.beginPath();
          ctx.moveTo(gate.x1, gate.y1);
          ctx.lineTo(gate.x2, gate.y2);
          ctx.stroke();

          // Retracted latch against the wall
          ctx.fillStyle = '#22c55e';
          const rx = gate.x1;
          const ry = gate.y1;
          ctx.beginPath();
          ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Closed state: chunky barrier latch blocking corridor
          ctx.strokeStyle = '#7f1d1d';
          ctx.lineWidth = gate.thickness;
          ctx.beginPath();
          ctx.moveTo(gate.x1, gate.y1);
          ctx.lineTo(gate.x2, gate.y2);
          ctx.stroke();

          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(gate.x1, gate.y1);
          ctx.lineTo(gate.x2, gate.y2);
          ctx.stroke();

          // Pulsing warning indicator dot
          ctx.fillStyle = '#f87171';
          const midX = (gate.x1 + gate.x2) / 2;
          const midY = (gate.y1 + gate.y2) / 2;
          ctx.beginPath();
          ctx.arc(midX, midY, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Draw Brass Key (hit radius 10px, drawn with authentic brass details)
      const kCur = keyPosRef.current;
      ctx.save();
      ctx.translate(kCur.x, kCur.y);

      // Outer brass ring
      ctx.fillStyle = '#f59e0b';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, KEY_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner keyhole hole
      ctx.fillStyle = '#3b1604';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      // Brass shaft & teeth
      ctx.fillStyle = '#f59e0b';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.5;
      ctx.fillRect(KEY_RADIUS - 1, -2.5, 12, 5);
      ctx.strokeRect(KEY_RADIUS - 1, -2.5, 12, 5);

      ctx.fillRect(KEY_RADIUS + 6, 2.5, 2.5, 4.5);
      ctx.fillRect(KEY_RADIUS + 2, 2.5, 2.5, 3.5);
      ctx.restore();

      // Handwritten tally marks in top-left corner
      ctx.save();
      ctx.fillStyle = '#78350f';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('ATTEMPTS:', 36, 42);

      const tallyBaseX = 115;
      const tallyBaseY = 32;
      for (let i = 0; i < Math.min(attempts, 25); i++) {
        const group = Math.floor(i / 5);
        const posInGroup = i % 5;
        const startX = tallyBaseX + group * 35;
        if (posInGroup < 4) {
          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(startX + posInGroup * 6, tallyBaseY);
          ctx.lineTo(startX + posInGroup * 6, tallyBaseY + 14);
          ctx.stroke();
        } else {
          ctx.strokeStyle = '#b91c1c';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(startX - 2, tallyBaseY + 12);
          ctx.lineTo(startX + 22, tallyBaseY + 2);
          ctx.stroke();
        }
      }
      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, attempts]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/85 backdrop-blur-sm select-none pointer-events-auto"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) e.stopPropagation();
      }}
    >
      <div
        className="relative w-full max-w-[840px] bg-neutral-900 border border-amber-600/60 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden font-sans text-neutral-100"
        style={{
          clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)',
        }}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-neutral-950 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-mono text-sm tracking-wider uppercase font-bold text-amber-300">
              DRAWER MAZE // RETRIEVE KITCHEN KEY
            </span>
          </div>

          {/* Right: ESC // RETURN Button & Optional Skip Button after 6 resets */}
          <div className="flex items-center gap-3 z-50">


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
            className="w-full max-w-[800px] h-auto border-2 border-stone-800 rounded-lg shadow-2xl cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />

          {/* Bottom Narrative / Guidance Line */}
          <div className="w-full max-w-[800px] mt-2.5 flex items-center justify-between text-xs text-stone-400 font-mono">
            <div className="flex items-center gap-2">
              <span className="text-amber-400">HOLD & DRAG:</span>
              <span>Guide brass key through drawer maze. Touching clutter or releasing resets key.</span>
            </div>
            <div>
              <span className="text-stone-500">Press ESC to exit.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

