// components/GameTutorial.tsx
'use client';

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { PenState, DrawingMode, MenuLevel, MenuItem } from '../types';
import { MoveHorizontal, MoveVertical, MoveDiagonal, MoveDiagonal2, PencilOff, Pencil, Eraser } from 'lucide-react';
import MenuPopup from './MenuPopup';

interface GameLevel {
  id: number;
  title: string;
  shape: string;
  description: string;
  targetGrid: boolean[][];
  maxMoves: number;
}

interface GameTutorialProps {
  onConnect: () => void;
  onDisconnect: () => void;
  connected: boolean;
  onComplete: () => void;
  onSkip: () => void;
  bleConnected?: boolean;
  bleEmitter?: any;
}

// Menu structure - updated to be a function that accepts shapeDrawingMode
const getMenuLevels = (shapeDrawingMode: boolean): MenuLevel[] => [
  {
    id: 0,
    name: 'Drawing Controls',
    items: [
      { id: 'undo', name: 'Undo', icon: '↩️', action: 'undo' },
      { id: 'redo', name: 'Redo', icon: '↪️', action: 'redo' },
      { id: 'dir-up-down', name: '↑↓ Direction', icon: '↕️', action: 'mode-vertical' },
      { id: 'dir-left-right', name: '←→ Direction', icon: '↔️', action: 'mode-horizontal' },
      { id: 'dir-sw-ne', name: '↙↗ Direction', icon: '↗️', action: 'mode-diagonal-ne-sw' },
      { id: 'dir-se-nw', name: '↘↖ Direction', icon: '↖️', action: 'mode-diagonal-nw-se' },
      // Only show pen options when NOT in shape drawing mode
      ...(!shapeDrawingMode ? [
        { id: 'pen-enable', name: 'Pen Enable', icon: '✏️', action: 'pen-1' },
        { id: 'eraser-enable', name: 'Eraser Enable', icon: '🧽', action: 'pen-2' },
        { id: 'pen-disable', name: 'Pen Disable', icon: '🚫', action: 'pen-0' },
      ] : [])
    ]
  },
  {
    id: 1,
    name: 'File Operations',
    items: [
      { id: 'save', name: 'Save Drawing', icon: '💾', action: 'save' },
      { id: 'new-board', name: 'New Board', icon: '🆕', action: 'new' },
      { id: 'clear-board', name: 'Clear Board', icon: '🧹', action: 'clear' },
      { id: 'exit', name: 'Exit Menu', icon: '❌', action: 'exit' },
    ]
  },
  {
    id: 2,
    name: 'Shapes',
    items: [
      { id: 'line', name: 'Line Tool', icon: '📏', action: 'shape-line' },
      { id: 'rectangle', name: 'Rectangle', icon: '⬜', action: 'shape-rect' },
      { id: 'triangle', name: 'Triangle', icon: '🔺', action: 'shape-tri' },
      { id: 'pixels', name: 'Pixel Mode', icon: '🔲', action: 'shape-pixel' },
      { id: 'cancel-shape', name: 'Cancel Shape', icon: '❌', action: 'shape-cancel' },
    ]
  }
];

const GameTutorial: React.FC<GameTutorialProps> = ({
  onComplete,
  connected,
  onDisconnect,
  onConnect,
  onSkip,
  bleConnected = false,
  bleEmitter
}) => {
  const [currentLevel, setCurrentLevel] = useState(0);
  const [playerGrid, setPlayerGrid] = useState<boolean[][]>([]);
  const [moves, setMoves] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [cursorX, setCursorX] = useState(0);
  const [cursorY, setCursorY] = useState(0);
  const [penState, setPenState] = useState<PenState>(0);
  const [currentMode, setCurrentMode] = useState<DrawingMode>(0);
  const [score, setScore] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [accuracy, setAccuracy] = useState(0);
  const [timeLeft, setTimeLeft] = useState(300);
  const [lastBleAction, setLastBleAction] = useState('');

  
  // Menu state
  const [menuActive, setMenuActive] = useState(false);
  const [menuLevel, setMenuLevel] = useState(0);
  const [menuSelections, setMenuSelections] = useState<Record<number, number>>({
    0: 0,
    1: 0,
    2: 0
  });
  const menuSelection = menuSelections[menuLevel] || 0;

  // Cursor pixel position for menu
  const [cursorPixelPosition, setCursorPixelPosition] = useState({ x: 0, y: 0 });

  // Shape drawing state
  const [selectedShape, setSelectedShape] = useState<string | null>(null);
  const [shapeInitialPoint, setShapeInitialPoint] = useState<{ x: number; y: number } | null>(null);
  const [shapeDrawingMode, setShapeDrawingMode] = useState(false);
  const [previewShape, setPreviewShape] = useState<{
    start: { x: number; y: number };
    current: { x: number; y: number };
    shape: string;
  } | null>(null);

  // Grid dimensions state
  const [gridDimensions, setGridDimensions] = useState({ columns: 0, rows: 0 });
  const [calculatedDotSize, setCalculatedDotSize] = useState(24);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [availableGridArea, setAvailableGridArea] = useState({ width: 0, height: 0 });

  // Menu timeout refs
  const menuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const selectionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs for state values
  const cursorXRef = useRef(cursorX);
  const cursorYRef = useRef(cursorY);
  const currentModeRef = useRef(currentMode);
  const penStateRef = useRef(penState);
  const gridDimensionsRef = useRef(gridDimensions);
  const selectedShapeRef = useRef(selectedShape);
  const shapeInitialPointRef = useRef(shapeInitialPoint);
  const shapeDrawingModeRef = useRef(shapeDrawingMode);
  const menuActiveRef = useRef(menuActive);
  const menuLevelRef = useRef(menuLevel);
  const menuSelectionsRef = useRef(menuSelections);

  // Update refs
  useEffect(() => {
    cursorXRef.current = cursorX;
    cursorYRef.current = cursorY;
    currentModeRef.current = currentMode;
    penStateRef.current = penState;
    gridDimensionsRef.current = gridDimensions;
    selectedShapeRef.current = selectedShape;
    shapeInitialPointRef.current = shapeInitialPoint;
    shapeDrawingModeRef.current = shapeDrawingMode;
    menuActiveRef.current = menuActive;
    menuLevelRef.current = menuLevel;
    menuSelectionsRef.current = menuSelections;
  }, [cursorX, cursorY, currentMode, penState, gridDimensions, selectedShape, shapeInitialPoint, shapeDrawingMode, menuActive, menuLevel, menuSelections]);

  // Update cursor pixel position
  useEffect(() => {
    if (gridContainerRef.current && gridDimensions.columns > 0 && gridDimensions.rows > 0) {
      const container = gridContainerRef.current;
      const rect = container.getBoundingClientRect();

      const cellWidth = rect.width / gridDimensions.columns;
      const cellHeight = rect.height / gridDimensions.rows;

      const pixelX = rect.left + (cursorX * cellWidth) + (cellWidth / 2);
      const pixelY = rect.top + (cursorY * cellHeight) + (cellHeight / 2);

      setCursorPixelPosition({ x: pixelX, y: pixelY });
    }
  }, [cursorX, cursorY, gridDimensions]);

  // Game levels - target patterns only, dimensions will be calculated dynamically
  const levels: GameLevel[] = [
    {
      id: 1,
      title: "Level 1: Triangle",
      shape: "▲",
      description: "Trace the triangle using BLE controls",
      maxMoves: 50,
      targetGrid: [] // Will be generated based on grid dimensions
    },
    {
      id: 2,
      title: "Level 2: Rectangle",
      shape: "■",
      description: "Trace the rectangle using BLE controls",
      maxMoves: 60,
      targetGrid: [] // Will be generated based on grid dimensions
    },
    {
      id: 3,
      title: "Level 3: Combo",
      shape: "➡️",
      description: "Trace the combo(line+rectangle+triangle) using BLE controls",
      maxMoves: 70,
      targetGrid: [] // Will be generated based on grid dimensions
    }
  ];

  // Generate target grid based on current dimensions
  const generateTargetGrid = useCallback((columns: number, rows: number, levelId: number): boolean[][] => {
    const grid = Array(rows).fill(null).map(() => Array(columns).fill(false));
    const centerX = Math.floor(columns / 2);
    const centerY = Math.floor(rows / 2);

    switch (levelId) {
      case 1: { // Triangle (outline only)
        const size = Math.floor(Math.min(columns, rows) * 0.6);
        const halfSize = Math.floor(size / 2);

        const topY = centerY - halfSize;
        const bottomY = centerY + halfSize;
        const leftX = centerX - halfSize;
        const rightX = centerX + halfSize;

        // Draw the three sides of the triangle

        // Left side (top to bottom-left)
        for (let y = topY; y <= bottomY; y++) {
          if (y < 0 || y >= rows) continue;

          const progress = (y - topY) / (bottomY - topY);
          const x = centerX - Math.floor(progress * halfSize);

          if (x >= 0 && x < columns) {
            grid[y][x] = true;
          }
        }

        // Right side (top to bottom-right)
        for (let y = topY; y <= bottomY; y++) {
          if (y < 0 || y >= rows) continue;

          const progress = (y - topY) / (bottomY - topY);
          const x = centerX + Math.floor(progress * halfSize);

          if (x >= 0 && x < columns) {
            grid[y][x] = true;
          }
        }

        // Bottom side (horizontal line)
        for (let x = leftX; x <= rightX; x++) {
          if (x >= 0 && x < columns && bottomY >= 0 && bottomY < rows) {
            grid[bottomY][x] = true;
          }
        }

        break;
      }

      case 2: { // Rectangle (outline only)
        const rectWidth = Math.floor(Math.min(columns, rows) * 0.6);
        const rectHeight = Math.floor(Math.min(columns, rows) * 0.4);

        const startX = Math.floor(centerX - rectWidth / 2);
        const startY = Math.floor(centerY - rectHeight / 2);

        const endX = startX + rectWidth - 1;
        const endY = startY + rectHeight - 1;

        // Draw only the outline (top, bottom, left, right edges)
        for (let x = startX; x <= endX; x++) {
          if (x < 0 || x >= columns) continue;

          // Top edge
          if (startY >= 0 && startY < rows) {
            grid[startY][x] = true;
          }

          // Bottom edge
          if (endY >= 0 && endY < rows) {
            grid[endY][x] = true;
          }
        }

        for (let y = startY + 1; y < endY; y++) {
          if (y < 0 || y >= rows) continue;

          // Left edge
          if (startX >= 0 && startX < columns) {
            grid[y][startX] = true;
          }

          // Right edge
          if (endX >= 0 && endX < columns) {
            grid[y][endX] = true;
          }
        }

        break;
      }

      case 3: { // Arrow with stem and box at bottom
        const size = Math.floor(Math.min(columns, rows) * 0.7);
        const arrowHeight = Math.floor(size * 0.6); // Height of arrow part
        const boxHeight = Math.floor(size * 0.4);   // Height of box part
        const boxWidth = Math.floor(size * 0.5);    // Width of box
        const arrowWidth = Math.floor(size * 0.4);  // Width of arrow head

        const startY = centerY - Math.floor(arrowHeight / 2);
        const boxStartY = startY + arrowHeight - 1;
        const boxEndY = boxStartY + boxHeight - 1;

        const arrowTipX = centerX;
        const arrowBaseLeftX = centerX - Math.floor(arrowWidth / 2);
        const arrowBaseRightX = centerX + Math.floor(arrowWidth / 2);

        const boxLeftX = centerX - Math.floor(boxWidth / 2);
        const boxRightX = centerX + Math.floor(boxWidth / 2);

        // Draw arrow (triangle outline)

        // Left side of arrow
        for (let y = startY; y < boxStartY; y++) {
          if (y < 0 || y >= rows) continue;

          const progress = (y - startY) / (arrowHeight - 1);
          const x = arrowTipX - Math.floor(progress * Math.floor(arrowWidth / 2));

          if (x >= 0 && x < columns) {
            grid[y][x] = true;
          }
        }

        // Right side of arrow
        for (let y = startY; y < boxStartY; y++) {
          if (y < 0 || y >= rows) continue;

          const progress = (y - startY) / (arrowHeight - 1);
          const x = arrowTipX + Math.floor(progress * Math.floor(arrowWidth / 2));

          if (x >= 0 && x < columns) {
            grid[y][x] = true;
          }
        }

        // Bottom of arrow (where it meets the box)
        for (let x = arrowBaseLeftX; x <= arrowBaseRightX; x++) {
          if (x >= 0 && x < columns && boxStartY - 1 >= 0 && boxStartY - 1 < rows) {
            grid[boxStartY - 1][x] = true;
          }
        }

        // Draw box (rectangle outline)

        // Top of box
        for (let x = boxLeftX; x <= boxRightX; x++) {
          if (x >= 0 && x < columns && boxStartY >= 0 && boxStartY < rows) {
            grid[boxStartY][x] = true;
          }
        }

        // Bottom of box
        for (let x = boxLeftX; x <= boxRightX; x++) {
          if (x >= 0 && x < columns && boxEndY >= 0 && boxEndY < rows) {
            grid[boxEndY][x] = true;
          }
        }

        // Sides of box
        for (let y = boxStartY + 1; y < boxEndY; y++) {
          if (y < 0 || y >= rows) continue;

          // Left side
          if (boxLeftX >= 0 && boxLeftX < columns) {
            grid[y][boxLeftX] = true;
          }

          // Right side
          if (boxRightX >= 0 && boxRightX < columns) {
            grid[y][boxRightX] = true;
          }
        }

        // Vertical line through arrow (optional - makes it look more like an arrow)
        for (let y = startY + 1; y < boxStartY; y++) {
          if (y < 0 || y >= rows) continue;

          if (arrowTipX >= 0 && arrowTipX < columns) {
            grid[y][arrowTipX] = true;
          }
        }

        break;
      }
    }

    return grid;
  }, []);

  // Calculate grid size based on container
  const calculateGridSize = useCallback((availableWidth: number, availableHeight: number, targetDotSize: number) => {
    const columns = Math.max(8, Math.floor(availableWidth / targetDotSize));
    const rows = Math.max(8, Math.floor(availableHeight / targetDotSize));

    const exactWidthDotSize = availableWidth / columns;
    const exactHeightDotSize = availableHeight / rows;

    const exactDotSize = Math.min(exactWidthDotSize, exactHeightDotSize);

    return {
      columns,
      rows,
      dotSize: exactDotSize
    };
  }, []);

  // Update layout
  const updateLayout = useCallback(() => {
    if (!containerRef.current || !gridContainerRef.current) return;

    const gridRect = gridContainerRef.current.getBoundingClientRect();

    const availableWidth = Math.max(100, gridRect.width);
    const availableHeight = Math.max(100, gridRect.height);

    const { columns, rows, dotSize } = calculateGridSize(availableWidth, availableHeight, 24);

    setAvailableGridArea({
      width: availableWidth,
      height: availableHeight
    });

    setGridDimensions({ columns, rows });
    setCalculatedDotSize(dotSize);

    setPlayerGrid(prev => {
      if (prev.length === rows && (prev[0]?.length || 0) === columns) {
        return prev;
      }
      return Array(rows).fill(null).map(() => Array(columns).fill(false));
    });

    setCursorX(prev => {
      if (prev >= columns) return Math.max(0, columns - 1);
      return prev;
    });
    setCursorY(prev => {
      if (prev >= rows) return Math.max(0, rows - 1);
      return prev;
    });
  }, [calculateGridSize]);

  // Use layout effect for DOM measurements
  useLayoutEffect(() => {
    updateLayout();

    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        updateLayout();
      }, 50);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    if (gridContainerRef.current) {
      resizeObserver.observe(gridContainerRef.current);
    }

    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
    };
  }, [updateLayout]);

// Set cursor to center when grid dimensions are first established
useEffect(() => {
  if (gridDimensions.columns > 0 && gridDimensions.rows > 0) {
    setCursorX(Math.floor(gridDimensions.columns / 2));
    setCursorY(Math.floor(gridDimensions.rows / 2));
  }
}, [gridDimensions.columns, gridDimensions.rows]); // This will run whenever grid dimensions change

  // Helper function to draw line on grid
  const drawLineOnGrid = useCallback((
    grid: boolean[][],
    start: { x: number; y: number },
    end: { x: number; y: number },
    shouldDraw: boolean
  ) => {
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const sx = start.x < end.x ? 1 : -1;
    const sy = start.y < end.y ? 1 : -1;
    let err = dx - dy;
    let x = start.x;
    let y = start.y;

    while (true) {
      if (grid[y] && grid[y][x] !== undefined) {
        grid[y][x] = shouldDraw;
      }

      if (x === end.x && y === end.y) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }, []);

  // Draw shape
  const drawShape = useCallback((
    shape: string | null,
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) => {
    if (!shape) return;

    console.log('Game: Drawing shape:', shape, 'from', start, 'to', end);

    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    setPlayerGrid(prev => {
      const newGrid = prev.map(row => [...row]);
      const shouldDraw = penStateRef.current === 1;

      switch (shape) {
        case 'line':
          drawLineOnGrid(newGrid, start, end, shouldDraw);
          break;

        case 'rectangle':
          for (let x = minX; x <= maxX; x++) {
            if (newGrid[minY] && newGrid[minY][x] !== undefined) {
              newGrid[minY][x] = shouldDraw;
            }
            if (newGrid[maxY] && newGrid[maxY][x] !== undefined) {
              newGrid[maxY][x] = shouldDraw;
            }
          }
          for (let y = minY; y <= maxY; y++) {
            if (newGrid[y] && newGrid[y][minX] !== undefined) {
              newGrid[y][minX] = shouldDraw;
            }
            if (newGrid[y] && newGrid[y][maxX] !== undefined) {
              newGrid[y][maxX] = shouldDraw;
            }
          }
          break;

        case 'triangle':
          const midX = Math.floor((start.x + end.x) / 2);
          const topY = minY;
          const bottomY = maxY;

          drawLineOnGrid(newGrid, { x: midX, y: topY }, { x: minX, y: bottomY }, shouldDraw);
          drawLineOnGrid(newGrid, { x: midX, y: topY }, { x: maxX, y: bottomY }, shouldDraw);
          drawLineOnGrid(newGrid, { x: minX, y: bottomY }, { x: maxX, y: bottomY }, shouldDraw);
          break;

        case 'pixel':
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              if (newGrid[y] && newGrid[y][x] !== undefined) {
                newGrid[y][x] = shouldDraw;
              }
            }
          }
          break;
      }

      return newGrid;
    });

    setMoves(prev => prev + 10);
  }, [drawLineOnGrid]);

  // Handle blink for shape point selection
  const handleBlinkForShape = useCallback((state: number) => {
    console.log('Game: Blink received, state:', state, 'shapeDrawingMode:', shapeDrawingModeRef.current, 'selectedShape:', selectedShapeRef.current);

    if (!shapeDrawingModeRef.current || !selectedShapeRef.current) {
      if (state >= 0 && state <= 2) {
        setPenState(state as PenState);
        setLastBleAction(`Pen: ${state === 0 ? 'Off' : state === 1 ? 'Draw' : 'Erase'}`);
        console.log('Game: Pen state changed to:', state);
      }
      return;
    }

    if (!shapeInitialPointRef.current) {
      setShapeInitialPoint({ x: cursorXRef.current, y: cursorYRef.current });
      setLastBleAction(`📍 Shape start (${cursorXRef.current}, ${cursorYRef.current})`);
      console.log('Game: Shape initial point set');
    } else {
      console.log('Game: Drawing shape now...');
      drawShape(
        selectedShapeRef.current,
        shapeInitialPointRef.current,
        { x: cursorXRef.current, y: cursorYRef.current }
      );

      setShapeInitialPoint(null);
      setPreviewShape(null);
      setShapeDrawingMode(false);
      setSelectedShape(null);
      setPenState(0);
      setLastBleAction('✅ Shape completed - Pen off');
      console.log('Game: Shape completed, pen disabled');
    }
  }, [drawShape]);

  // Handle drawing at position
  const handleDrawAtPosition = useCallback((x: number, y: number) => {
    if (isComplete || y >= playerGrid.length || x >= playerGrid[0]?.length) return;

    setPlayerGrid(prev => {
      const newGrid = [...prev.map(row => [...row])];
      if (penState === 1) {
        if (!newGrid[y][x]) {
          newGrid[y][x] = true;
          setIsDrawing(true);
          setTimeout(() => setIsDrawing(false), 100);
        }
      } else if (penState === 2) {
        if (newGrid[y][x]) {
          newGrid[y][x] = false;
          setIsDrawing(true);
          setTimeout(() => setIsDrawing(false), 100);
        }
      }
      return newGrid;
    });
  }, [penState, isComplete, playerGrid]);

  // Reset menu timeout
  const resetMenuTimeout = useCallback(() => {
    if (menuTimeoutRef.current) {
      clearTimeout(menuTimeoutRef.current);
      menuTimeoutRef.current = null;
    }

    if (menuActiveRef.current) {
      menuTimeoutRef.current = setTimeout(() => {
        if (menuActiveRef.current) {
          setMenuActive(false);
          setLastBleAction('⏰ Menu auto-closed');
        }
      }, 2000);
    }
  }, []);

  // Reset selection timer
  const resetSelectionTimer = useCallback(() => {
    if (selectionTimerRef.current) {
      clearTimeout(selectionTimerRef.current);
      selectionTimerRef.current = null;
    }
  }, []);

  // Start selection timer for current menu item
  const startSelectionTimer = useCallback(() => {
    if (!menuActiveRef.current) return;

    resetSelectionTimer();

    selectionTimerRef.current = setTimeout(() => {
      if (menuActiveRef.current) {
        const menuLevels = getMenuLevels(shapeDrawingModeRef.current);
        const currentLevel = menuLevels[menuLevelRef.current];
        const selectedItem = currentLevel.items[menuSelectionsRef.current[menuLevelRef.current]];

        if (selectedItem) {
          executeMenuAction(selectedItem.action);
          setLastBleAction(`✅ Auto-selected: ${selectedItem.name}`);

          if (selectedItem.action !== 'exit') {
            setMenuActive(false);
          }
        }
      }
    }, 2000);
  }, [resetSelectionTimer]);

  // Handle mode switch / menu control (S command)
  const handleModeSwitch = useCallback((mode: number) => {
    if (menuActiveRef.current) {
      const menuLevels = getMenuLevels(shapeDrawingModeRef.current);
      const newLevel = (menuLevelRef.current + 1) % menuLevels.length;
      setMenuLevel(newLevel);
      setLastBleAction(`📂 Menu level: ${menuLevels[newLevel].name}`);
      resetMenuTimeout();
      resetSelectionTimer();
      startSelectionTimer();
    } else {
      console.log('Game: Opening menu');
      setMenuActive(true);
      setLastBleAction(`📋 Menu opened at level ${menuLevel + 1}`);

      setTimeout(() => {
        resetMenuTimeout();
      }, 0);

      startSelectionTimer();
    }
  }, [menuLevel, resetMenuTimeout, resetSelectionTimer, startSelectionTimer]);

  // Handle BLE movement in game
  const handleBleMovement = useCallback((direction: number) => {
    if (isComplete || gridDimensions.columns === 0 || gridDimensions.rows === 0) return;

    if (menuActiveRef.current) {
      // In menu: navigate items
      const menuLevels = getMenuLevels(shapeDrawingModeRef.current);
      const currentLevel = menuLevels[menuLevelRef.current];
      const itemsCount = currentLevel.items.length;
      let newSelection = menuSelectionsRef.current[menuLevelRef.current];

      if (direction === 8) {
        newSelection = (menuSelectionsRef.current[menuLevelRef.current] - 1 + itemsCount) % itemsCount;
      } else if (direction === 9) {
        newSelection = (menuSelectionsRef.current[menuLevelRef.current] + 1) % itemsCount;
      }

      setMenuSelections(prev => ({
        ...prev,
        [menuLevelRef.current]: newSelection
      }));

      setLastBleAction(`⬆️⬇️ Menu item ${newSelection + 1}`);

      resetMenuTimeout();
      resetSelectionTimer();
      startSelectionTimer();

      return;
    }

    setLastBleAction(`Movement: ${direction}`);

    const { columns, rows } = gridDimensions;
    let newX = cursorX;
    let newY = cursorY;
    let moved = false;

    switch (currentMode) {
      case 0:
        if (direction === 9) {
          newX = Math.max(0, cursorX - 1);
          moved = true;
        } else if (direction === 8) {
          newX = Math.min(columns - 1, cursorX + 1);
          moved = true;
        }
        break;

      case 1:
        if (direction === 8) {
          newY = Math.max(0, cursorY - 1);
          moved = true;
        } else if (direction === 9) {
          newY = Math.min(rows - 1, cursorY + 1);
          moved = true;
        }
        break;

      case 2:
        if (direction === 9) {
          newX = Math.max(0, cursorX - 1);
          newY = Math.max(0, cursorY - 1);
          moved = true;
        } else if (direction === 8) {
          newX = Math.min(columns - 1, cursorX + 1);
          newY = Math.min(rows - 1, cursorY + 1);
          moved = true;
        }
        break;

      case 3:
        if (direction === 8) {
          newX = Math.min(columns - 1, cursorX + 1);
          newY = Math.max(0, cursorY - 1);
          moved = true;
        } else if (direction === 9) {
          newX = Math.max(0, cursorX - 1);
          newY = Math.min(rows - 1, cursorY + 1);
          moved = true;
        }
        break;
    }

    if (moved) {
      const positionChanged = newX !== cursorX || newY !== cursorY;
      if (positionChanged) {
        if (newX !== cursorX) setCursorX(newX);
        if (newY !== cursorY) setCursorY(newY);

        if (shapeDrawingModeRef.current && shapeInitialPointRef.current) {
          setPreviewShape({
            start: shapeInitialPointRef.current,
            current: { x: newX, y: newY },
            shape: selectedShapeRef.current!
          });
        }

        if (penState !== 0 && !shapeDrawingModeRef.current) {
          handleDrawAtPosition(newX, newY);
        }

        setMoves(prev => prev + 1);
      }
    }
  }, [cursorX, cursorY, currentMode, penState, isComplete, gridDimensions, handleDrawAtPosition, resetMenuTimeout, resetSelectionTimer, startSelectionTimer]);

  // Execute menu action
  const executeMenuAction = useCallback((action: string) => {
    console.log('Game: Executing menu action:', action);

    switch (action) {
      case 'mode-horizontal':
        setCurrentMode(0);
        setLastBleAction('↔️ Mode: Horizontal');
        break;
      case 'mode-vertical':
        setCurrentMode(1);
        setLastBleAction('↕️ Mode: Vertical');
        break;
      case 'mode-diagonal-nw-se':
        setCurrentMode(2);
        setLastBleAction('↖️ Mode: Diagonal NW-SE');
        break;
      case 'mode-diagonal-ne-sw':
        setCurrentMode(3);
        setLastBleAction('↗️ Mode: Diagonal NE-SW');
        break;

      case 'pen-0':
        setPenState(0);
        setLastBleAction('🚫 Pen disabled');
        break;
      case 'pen-1':
        setPenState(1);
        setLastBleAction('✏️ Pen enabled');
        break;
      case 'pen-2':
        setPenState(2);
        setLastBleAction('🧽 Eraser enabled');
        break;

      case 'shape-line':
        setSelectedShape('line');
        setShapeDrawingMode(true);
        setShapeInitialPoint(null);
        setPreviewShape(null);
        setPenState(1);
        setMenuActive(false);
        setLastBleAction('📏 Line tool - Blink to set start');
        break;
      case 'shape-rect':
        setSelectedShape('rectangle');
        setShapeDrawingMode(true);
        setShapeInitialPoint(null);
        setPreviewShape(null);
        setPenState(1);
        setMenuActive(false);
        setLastBleAction('⬜ Rectangle tool - Blink to set start');
        break;
      case 'shape-tri':
        setSelectedShape('triangle');
        setShapeDrawingMode(true);
        setShapeInitialPoint(null);
        setPreviewShape(null);
        setPenState(1);
        setMenuActive(false);
        setLastBleAction('🔺 Triangle tool - Blink to set start');
        break;
      case 'shape-pixel':
        setSelectedShape('pixel');
        setShapeDrawingMode(true);
        setShapeInitialPoint(null);
        setPreviewShape(null);
        setPenState(1);
        setMenuActive(false);
        setLastBleAction('🔲 Pixel mode - Blink to set start');
        break;

      case 'shape-cancel':
        setShapeDrawingMode(false);
        setSelectedShape(null);
        setShapeInitialPoint(null);
        setPreviewShape(null);
        setPenState(0);
        setMenuActive(false);
        setLastBleAction('❌ Shape cancelled');
        break;

      case 'clear':
        setPlayerGrid(prev => prev.map(row => row.map(() => false)));
        setMoves(0);
        setLastBleAction('🧹 Board cleared');
        setMenuActive(false);
        break;

      case 'new':
        setPlayerGrid(prev => prev.map(row => row.map(() => false)));
        setMoves(0);
        setShapeDrawingMode(false);
        setSelectedShape(null);
        setShapeInitialPoint(null);
        setPreviewShape(null);
        setPenState(0);
        setLastBleAction('🆕 New board');
        setMenuActive(false);
        break;

      case 'exit':
        setMenuActive(false);
        setLastBleAction('❌ Menu closed');
        break;

      case 'undo':
        // Simple undo for game - clear last few moves
        setPlayerGrid(prev => prev.map(row => row.map(() => false)));
        setMoves(Math.max(0, moves - 5));
        setLastBleAction('↶ Undo');
        setMenuActive(false);
        break;

      case 'redo':
        setLastBleAction('↷ Redo (not implemented)');
        setMenuActive(false);
        break;

      case 'save':
        setLastBleAction('💾 Save (game mode)');
        setMenuActive(false);
        break;

      default:
        console.log('Unknown action:', action);
    }
  }, [moves]);

  // Setup BLE event listeners for game
  useEffect(() => {
    if (!bleEmitter) return;

    const handleBLEMovement = (direction: number) => {
      console.log('Game: Received movement event', direction);
      handleBleMovement(direction);
    };

    const handleBLEMode = (mode: number) => {
      console.log('Game: Received mode event', mode);
      handleModeSwitch(mode);
    };

    const handleBLEBlink = (state: number) => {
      console.log('Game: Received blink event', state);
      handleBlinkForShape(state);
    };

    const handleBLEJaw = (seconds: number) => {
      console.log('Game: Received jaw timer event', seconds);
      setLastBleAction(`Jaw: ${seconds}s`);
    };

    bleEmitter.on('movement', handleBLEMovement);
    bleEmitter.on('mode', handleBLEMode);
    bleEmitter.on('blink', handleBLEBlink);
    bleEmitter.on('j', handleBLEJaw);

    return () => {
      bleEmitter.off('movement', handleBLEMovement);
      bleEmitter.off('mode', handleBLEMode);
      bleEmitter.off('blink', handleBLEBlink);
      bleEmitter.off('j', handleBLEJaw);
    };
  }, [bleEmitter, handleBleMovement, handleModeSwitch, handleBlinkForShape]);

  // Calculate accuracy
  useEffect(() => {
    if (gridDimensions.columns === 0 || gridDimensions.rows === 0) return;

    const targetGrid = generateTargetGrid(gridDimensions.columns, gridDimensions.rows, currentLevel + 1);
    let correctCount = 0;
    let totalTarget = 0;

    for (let y = 0; y < gridDimensions.rows; y++) {
      for (let x = 0; x < gridDimensions.columns; x++) {
        if (targetGrid[y] && targetGrid[y][x]) {
          totalTarget++;
          if (playerGrid[y] && playerGrid[y][x]) {
            correctCount++;
          }
        }
      }
    }

    const newAccuracy = totalTarget > 0 ? (correctCount / totalTarget) * 100 : 0;
    setAccuracy(newAccuracy);

    if (newAccuracy >= 85 && !isComplete && gridDimensions.columns > 0) {
      setIsComplete(true);
      const levelScore = Math.max(0, 100 - moves + Math.floor(timeLeft / 10));
      setScore(prev => prev + levelScore);
    }
  }, [playerGrid, currentLevel, moves, timeLeft, isComplete, gridDimensions, generateTargetGrid]);

  // Timer
  useEffect(() => {
    if (isComplete || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setIsComplete(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isComplete]);

  // Next level
  const nextLevel = () => {
    if (currentLevel < levels.length - 1) {
      setCurrentLevel(prev => prev + 1);
      setPlayerGrid(Array(gridDimensions.rows).fill(null).map(() => Array(gridDimensions.columns).fill(false)));
      setCursorX(Math.floor(gridDimensions.columns / 2));
      setCursorY(Math.floor(gridDimensions.rows / 2));
      setMoves(0);
      setIsComplete(false);
      setTimeLeft(300);
      setAccuracy(0);
      setShapeDrawingMode(false);
      setSelectedShape(null);
      setShapeInitialPoint(null);
      setPreviewShape(null);
      setMenuActive(false);
    } else {
      onComplete();
    }
  };

  // Reset level
  const resetLevel = () => {
    setPlayerGrid(Array(gridDimensions.rows).fill(null).map(() => Array(gridDimensions.columns).fill(false)));
    setMoves(0);
    setIsComplete(false);
    setCursorX(Math.floor(gridDimensions.columns / 2));
    setCursorY(Math.floor(gridDimensions.rows / 2));
    setTimeLeft(300);
    setAccuracy(0);
    setShapeDrawingMode(false);
    setSelectedShape(null);
    setShapeInitialPoint(null);
    setPreviewShape(null);
    setMenuActive(false);
  };

  // Get current menu items based on shape drawing mode
  const menuLevels = getMenuLevels(shapeDrawingMode);
  const currentMenuItems = menuLevels[menuLevel]?.items.map(item => ({
    id: item.id,
    name: item.name,
    icon: item.icon,
    action: () => executeMenuAction(item.action)
  })) || [];

  const level = levels[currentLevel];
  const isLastLevel = currentLevel === levels.length - 1;
  const modeNames = ['Horizontal', 'Vertical', 'Diagonal NW-SE', 'Diagonal NE-SW'];
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  // Calculate direction arrows
  const getDirectionArrows = () => {
    const arrows: { x: number, y: number, direction: string }[] = [];
    const { columns, rows } = gridDimensions;

    if (columns === 0 || rows === 0) return arrows;

    switch (currentMode) {
      case 0:
        if (cursorX > 0) arrows.push({ x: cursorX - 1, y: cursorY, direction: 'left' });
        if (cursorX < columns - 1) arrows.push({ x: cursorX + 1, y: cursorY, direction: 'right' });
        break;
      case 1:
        if (cursorY > 0) arrows.push({ x: cursorX, y: cursorY - 1, direction: 'up' });
        if (cursorY < rows - 1) arrows.push({ x: cursorX, y: cursorY + 1, direction: 'down' });
        break;
      case 2:
        if (cursorX > 0 && cursorY > 0) arrows.push({ x: cursorX - 1, y: cursorY - 1, direction: 'up-left' });
        if (cursorX < columns - 1 && cursorY < rows - 1) arrows.push({ x: cursorX + 1, y: cursorY + 1, direction: 'down-right' });
        break;
      case 3:
        if (cursorX < columns - 1 && cursorY > 0) arrows.push({ x: cursorX + 1, y: cursorY - 1, direction: 'up-right' });
        if (cursorX > 0 && cursorY < rows - 1) arrows.push({ x: cursorX - 1, y: cursorY + 1, direction: 'down-left' });
        break;
    }

    return arrows;
  };

  const directionArrows = getDirectionArrows();
  const gapSize = 0;

  // Function to check if a cell is part of shape preview
  const isInShapePreview = useCallback((x: number, y: number): boolean => {
    if (!previewShape) return false;

    const { start, current, shape } = previewShape;
    const minX = Math.min(start.x, current.x);
    const maxX = Math.max(start.x, current.x);
    const minY = Math.min(start.y, current.y);
    const maxY = Math.max(start.y, current.y);

    const isPointOnLine = (
      x: number,
      y: number,
      start: { x: number; y: number },
      end: { x: number; y: number }
    ): boolean => {
      const dx = Math.abs(end.x - start.x);
      const dy = Math.abs(end.y - start.y);
      const sx = start.x < end.x ? 1 : -1;
      const sy = start.y < end.y ? 1 : -1;
      let err = dx - dy;
      let cx = start.x;
      let cy = start.y;

      while (true) {
        if (cx === x && cy === y) return true;
        if (cx === end.x && cy === end.y) break;

        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          cx += sx;
        }
        if (e2 < dx) {
          err += dx;
          cy += sy;
        }
      }
      return false;
    };

    switch (shape) {
      case 'line':
        return isPointOnLine(x, y, start, current);
      case 'rectangle':
        return (x === minX || x === maxX) && y >= minY && y <= maxY ||
          (y === minY || y === maxY) && x >= minX && x <= maxX;
      case 'triangle':
        const midX = Math.floor((start.x + current.x) / 2);
        const topY = minY;
        const bottomY = maxY;
        return isPointOnLine(x, y, { x: midX, y: topY }, { x: minX, y: bottomY }) ||
          isPointOnLine(x, y, { x: midX, y: topY }, { x: maxX, y: bottomY }) ||
          isPointOnLine(x, y, { x: minX, y: bottomY }, { x: maxX, y: bottomY });
      case 'pixel':
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
      default:
        return false;
    }
  }, [previewShape]);

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 overflow-hidden">
      {/* Shape Drawing Indicator */}
      {shapeDrawingMode && selectedShape && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <span className="text-lg">
              {selectedShape === 'line' && '📏'}
              {selectedShape === 'rectangle' && '⬜'}
              {selectedShape === 'triangle' && '🔺'}
              {selectedShape === 'pixel' && '🔲'}
            </span>
            <span>
              {!shapeInitialPoint
                ? `Set start point for ${selectedShape} (Blink)`
                : `Set end point for ${selectedShape} (Blink)`}
            </span>
            <span className="ml-2 text-xs bg-green-500 px-2 py-1 rounded">
              Pen ON
            </span>
            <button
              onClick={() => {
                setShapeDrawingMode(false);
                setSelectedShape(null);
                setShapeInitialPoint(null);
                setPreviewShape(null);
                setPenState(0);
              }}
              className="ml-2 text-white/80 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="relative h-screen w-screen flex flex-col overflow-hidden" ref={containerRef}>
        {/* Top Bar */}
        <div className="bg-black/60 border-b border-gray-700 p-3 md:p-4 shrink-0">
          <div className="h-full max-w-[100vw] mx-auto flex justify-between items-center gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-xl md:text-2xl font-bold text-white">
                🧠 NeuroArt Training
              </h1>
              <div className={`px-2 py-1 rounded-lg text-sm ${bleConnected ? 'bg-green-800/70 text-green-300 border border-green-600' : 'bg-red-800/70 text-red-300 border border-red-600'}`}>
                {bleConnected ? '✅ NPG Lite device connected' : '❌ Connect NPG Lite device'}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex gap-2">
                {!connected ? (
                  <button
                    onClick={onConnect}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-600 transition-all text-sm"
                  >
                    <span className='mr-2'>🔗</span>
                    <span className="font-semibold">Connect NPG Lite</span>
                  </button>
                ) : (
                  <button
                    onClick={onDisconnect}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-600 transition-all text-sm"
                  >
                    <span>🔌</span>
                    <span className="font-semibold">Disconnect</span>
                  </button>
                )}
              </div>
              <button
                onClick={onSkip}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-600 transition-all text-sm"
              >
                Skip to Drawing
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden p-2 md:p-4">
          <div className="h-full w-full mx-auto grid grid-cols-1 lg:grid-cols-4 gap-3 md:gap-4">
            {/* Left Panel - Game Info */}
            <div className="lg:col-span-1 h-full flex flex-col gap-3 md:gap-4 overflow-hidden">
              {/* Main Dashboard Card */}
              <div className="bg-black/40 rounded-xl border border-gray-700 p-2 md:p-3 lg:p-4 shrink-0">
                {/* Header with Level and Score */}
                <div className="flex justify-between items-center mb-2 md:mb-3">
                  <div>
                    <h2 className="text-base md:text-lg lg:text-xl font-bold text-white truncate">{level.title}</h2>
                    <p className="text-gray-300 text-xs md:text-sm hidden sm:block line-clamp-2">{level.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xl md:text-2xl lg:text-3xl font-bold text-cyan-300">{score}</div>
                    <div className="text-gray-400 text-xs">Score</div>
                  </div>
                </div>

                {/* Stats Grid - Responsive */}
                <div className="grid grid-cols-3 gap-1 md:gap-2 mb-2 md:mb-3">
                  {/* Accuracy */}
                  <div className="bg-gray-800/50 rounded-lg p-1 md:p-2">
                    <div className="text-gray-400 text-xs">Accuracy</div>
                    <div className="font-bold text-sm md:text-base text-white">{accuracy.toFixed(1)}%</div>
                    <div className="h-1 bg-gray-800 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-green-600 transition-all duration-500" style={{ width: `${accuracy}%` }} />
                    </div>
                  </div>

                  {/* Moves */}
                  <div className="bg-gray-800/50 rounded-lg p-1 md:p-2">
                    <div className="text-gray-400 text-xs">Moves</div>
                    <div className="font-bold text-sm md:text-base text-white">{moves}</div>
                    <div className="h-1 bg-gray-800 rounded-full mt-1 overflow-hidden">
                      <div className={`h-full transition-all duration-500 ${moves > level.maxMoves * 0.8 ? 'bg-red-600' : moves > level.maxMoves * 0.6 ? 'bg-yellow-600' : 'bg-blue-600'}`}
                        style={{ width: `${Math.min(100, (moves / level.maxMoves) * 100)}%` }} />
                    </div>
                  </div>

                  {/* Time Left */}
                  <div className="bg-gray-800/50 rounded-lg p-1 md:p-2">
                    <div className="text-gray-400 text-xs">Time</div>
                    <div className={`font-bold text-sm md:text-base ${timeLeft < 60 ? 'text-red-400' : 'text-white'}`}>
                      {minutes}:{seconds.toString().padStart(2, '0')}
                    </div>
                    <div className="h-1 bg-gray-800 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-purple-600 transition-all duration-500" style={{ width: `${(timeLeft / 300) * 100}%` }} />
                    </div>
                  </div>
                </div>

                {/* Controls Status - Compact */}
                <div className="grid grid-cols-3 gap-1 md:gap-2 mb-2 md:mb-3">
                  <div className={`px-1 md:px-2 py-1 rounded-lg text-center ${currentMode === 0 ? 'bg-blue-800/30 text-blue-300 border border-blue-600' : 'bg-gray-800/30 text-gray-400'}`}>
                    <div className="text-xs font-bold truncate">{modeNames[currentMode]}</div>
                  </div>
                  <div className={`px-1 md:px-2 py-1 rounded-lg text-center ${penState === 1 ? 'bg-green-800/30 text-green-300 border border-green-600' : penState === 2 ? 'bg-yellow-800/30 text-yellow-300 border border-yellow-600' : 'bg-gray-800/30 text-gray-400'}`}>
                    <div className="text-xs font-bold truncate">
                      {penState === 0 ? 'Pen Off' : penState === 1 ? 'Draw' : 'Erase'}
                    </div>
                  </div>
                  <div className={`px-1 md:px-2 py-1 rounded-lg text-center ${menuActive ? 'bg-purple-800/30 text-purple-300 border border-purple-600' : 'bg-gray-800/30 text-gray-400'}`}>
                    <div className="text-xs font-bold truncate">{menuActive ? 'Menu On' : 'Menu Off'}</div>
                  </div>
                </div>

                {/* Action Buttons - Compact */}
                <div className="flex gap-1 md:gap-2">
                  <button
                    onClick={resetLevel}
                    className="flex-1 px-2 py-1 md:px-3 md:py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-600 transition-all text-xs md:text-sm"
                  >
                    Reset
                  </button>
                  {isComplete && (
                    <button
                      onClick={nextLevel}
                      className="flex-1 px-2 py-1 md:px-3 md:py-2 bg-blue-800 hover:bg-blue-700 text-white rounded-lg border border-blue-600 transition-all text-xs md:text-sm"
                    >
                      {isLastLevel ? 'Finish' : 'Next'}
                    </button>
                  )}
                </div>

                {/* Last BLE Action */}
                <div className="mt-1 text-[10px] md:text-xs text-gray-500 text-center truncate">
                  Last: {lastBleAction || '—'}
                </div>
              </div>

              {/* Levels List - Scrollable but compact */}
              <div className="bg-black/40 rounded-xl border border-gray-700 p-2 md:p-3 lg:p-4 flex-1 overflow-hidden flex flex-col min-h-0">
                <h3 className="text-sm md:text-base lg:text-lg font-bold text-white mb-1 md:mb-2">Levels</h3>
                <div className="space-y-1 overflow-y-auto flex-1 pr-1 scrollbar-thin scrollbar-thumb-gray-700">
                  {levels.map((levelItem, index) => (
                    <button
                      key={levelItem.id}
                      onClick={() => !isComplete && setCurrentLevel(index)}
                      disabled={isComplete}
                      className={`w-full flex items-center p-1.5 md:p-2 rounded-lg transition-all text-left ${currentLevel === index
                        ? 'bg-cyan-800/50 border border-cyan-600'
                        : index < currentLevel
                          ? 'bg-green-800/30 border border-green-700'
                          : 'bg-gray-800/30 border border-gray-700 hover:bg-gray-700/30'
                        }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="min-w-0 flex-1">
                          <div className="text-white font-medium text-xs md:text-sm truncate">Level {levelItem.id}</div>
                          <div className="text-gray-400 text-[10px] md:text-xs truncate hidden sm:block">{levelItem.title.split(': ')[1]}</div>
                        </div>
                      </div>
                      {index < currentLevel && (
                        <span className="text-green-400 text-xs md:text-sm shrink-0 ml-1">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Panel - Game Board */}
            <div className="lg:col-span-3 h-full flex flex-col overflow-hidden bg-black/40 rounded-xl">
              {/* Game Grid Container */}
              <div
                ref={gridContainerRef}
                className="flex-1 rounded-xl border border-gray-600 p-4 flex items-center justify-center overflow-hidden"
              >
                {gridDimensions.columns > 0 && gridDimensions.rows > 0 && (
                  <div
                    className="grid"
                    style={{
                      gridTemplateColumns: `repeat(${gridDimensions.columns}, 1fr)`,
                      gridTemplateRows: `repeat(${gridDimensions.rows}, 1fr)`,
                      width: '100%',
                      height: '100%',
                      gap: `${gapSize}px`,
                    }}
                  >
                    {Array.from({ length: gridDimensions.rows }).map((_, y) => (
                      Array.from({ length: gridDimensions.columns }).map((_, x) => {
                        const targetGrid = generateTargetGrid(gridDimensions.columns, gridDimensions.rows, currentLevel + 1);
                        const isTarget = targetGrid[y] && targetGrid[y][x];
                        const isPlayer = playerGrid[y] && playerGrid[y][x];
                        const isCursor = x === cursorX && y === cursorY;
                        const isArrow = directionArrows.some(arrow => arrow.x === x && arrow.y === y);
                        const arrowDirection = directionArrows.find(arrow => arrow.x === x && arrow.y === y)?.direction;
                        const isPreview = isInShapePreview(x, y) && !isPlayer && shapeDrawingMode;

                        const arrowSymbol = {
                          'up': '⬆',
                          'down': '⬇',
                          'left': '⬅',
                          'right': '➡',
                          'up-left': '↖',
                          'up-right': '↗',
                          'down-left': '↙',
                          'down-right': '↘'
                        }[arrowDirection || ''] || '';

                        // Base classes matching Whiteboard styling
                        let dotClasses = 'transition-all duration-200 flex items-center justify-center ';

                        // Background color based on state (matches Whiteboard)
                        if (isPlayer) {
                          dotClasses += ' bg-white border border-white';
                        } else if (isPreview) {
                          dotClasses += ' bg-blue-400/50 border border-blue-400 animate-pulse';
                        } else if (isTarget) {
                          dotClasses += ' bg-blue-800/5 '// Subtle target indicator
                        } else {
                          dotClasses += ' bg-gray-800/50 border border-gray-800';
                        }

                        // Cursor styling (matches Whiteboard exactly)
                        if (isCursor) {
                          const cursorConfig = {
                            0: { color: '#ef4444', shadow: '0 0 20px rgba(239,68,68,0.8)', symbol: 'X' },
                            1: { color: '#22c55e', shadow: '0 0 20px rgba(34,197,94,0.8)', symbol: 'O' },
                            2: { color: '#eab308', shadow: '0 0 20px rgba(234,179,8,0.8)', symbol: 'E' },
                          }[penState];

                          return (
                            <div
                              key={`${x}-${y}`}
                              className={`${dotClasses} animate-pulse z-20`}
                              style={{
                                width: '100%',
                                height: '100%',
                              }}
                              onClick={() => {
                                if (!isComplete && penState !== 0 && !shapeDrawingMode) {
                                  handleDrawAtPosition(x, y);
                                }
                              }}
                            >
                              <div
                                style={{
                                  color: cursorConfig.color,
                                  fontWeight: 'bold',
                                  fontSize: `${calculatedDotSize * 0.5}px`,
                                  textShadow: `0 0 8px ${cursorConfig.color}80`,
                                }}
                              >
                                {cursorConfig.symbol}
                              </div>
                            </div>
                          );
                        }
                        // Arrow cells (matches Whiteboard styling)
                        else if (isArrow) {
                          return (
                            <div
                              key={`${x}-${y}`}
                              className={`${dotClasses} z-10`}
                              style={{
                                width: '100%',
                                height: '100%',
                              }}
                              onClick={() => {
                                if (!isComplete && penState !== 0 && !shapeDrawingMode) {
                                  handleDrawAtPosition(x, y);
                                }
                              }}
                            >
                              {!isPlayer ? (
                                <div
                                  style={{
                                    color: 'white',
                                    fontWeight: 'bold',
                                    fontSize: `${calculatedDotSize * 0.4}px`,
                                    filter: 'drop-shadow(0 0 3px black)',
                                  }}
                                >
                                  {arrowSymbol}
                                </div>
                              ) : (
                                <div
                                  style={{
                                    color: 'black',
                                    fontWeight: 'bold',
                                    fontSize: `${calculatedDotSize * 0.4}px`,
                                  }}
                                >
                                  {arrowSymbol}
                                </div>
                              )}
                            </div>
                          );
                        }
                        // Preview cells (shape preview)
                        else if (isPreview) {
                          return (
                            <div
                              key={`${x}-${y}`}
                              className={`${dotClasses} z-10`}
                              style={{
                                width: '100%',
                                height: '100%',
                              }}
                              onClick={() => {
                                if (!isComplete && penState !== 0 && !shapeDrawingMode) {
                                  handleDrawAtPosition(x, y);
                                }
                              }}
                            >
                              <div
                                style={{
                                  color: '#60a5fa',
                                  fontWeight: 'bold',
                                  fontSize: `${calculatedDotSize * 0.4}px`,
                                }}
                              >
                                {selectedShape === 'line' && '📏'}
                                {selectedShape === 'rectangle' && '⬜'}
                                {selectedShape === 'triangle' && '🔺'}
                                {selectedShape === 'pixel' && '🔲'}
                              </div>
                            </div>
                          );
                        }
                        // Regular cells
                        else {
                          return (
                            <div
                              key={`${x}-${y}`}
                              className={dotClasses}
                              style={{
                                width: '100%',
                                height: '100%',
                              }}
                              onClick={() => {
                                if (!isComplete && penState !== 0 && !shapeDrawingMode) {
                                  handleDrawAtPosition(x, y);
                                }
                              }}
                            />
                          );
                        }
                      })
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Status Bar */}
        <div className="bg-black/60 border-t border-gray-700 p-3 shrink-0">
          <div className="h-full max-w-[100vw] mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-center gap-3">
              <div className="text-gray-400 text-sm text-center md:text-left">
                Grid: {gridDimensions.columns} × {gridDimensions.rows} | Cursor: ({cursorX}, {cursorY})
                {menuActive && ' | Menu Active'}
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-white">{currentLevel + 1}/3</div>
                  <div className="text-gray-400 text-xs">Level</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-white">{score}</div>
                  <div className="text-gray-400 text-xs">Score</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Menu Popup */}
      <MenuPopup
        active={menuActive}
        selection={menuSelection}
        items={currentMenuItems}
        level={menuLevel}
        levelName={menuLevels[menuLevel]?.name || ''}
        cursorX={cursorX}
        cursorY={cursorY}
        cursorPixelX={cursorPixelPosition.x}
        cursorPixelY={cursorPixelPosition.y}
        gridDimensions={gridDimensions}
        onClose={() => {
          setMenuActive(false);
          resetSelectionTimer();
        }}
        onSelect={(index) => {
          const item = currentMenuItems[index];
          if (item) {
            item.action();
            if (item.id !== 'exit') {
              setMenuActive(false);
            }
          }
        }}
      />
    </div>
  );
};

export default GameTutorial;