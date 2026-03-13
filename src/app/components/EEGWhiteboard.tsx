// components/EEGWhiteboard.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Header from './Header';
import Whiteboard from './Whiteboard';
import MenuPopup from './MenuPopup';
import JawTimer from './JawTimer';
import GameTutorial from './GameTutorial';
import { BoardState, DrawingMode, PenState, MenuLevel } from '../types';
import Link from "next/link";
import domtoimage from 'dom-to-image';

// Types for shape drawing
type ShapeType = 'line' | 'rectangle' | 'triangle' | 'pixel' | null;

// Create a shared BLE event emitter with firmware-compatible events
const createBLEEventEmitter = () => {
  const listeners: Record<string, Function[]> = {
    'movement': [],      // 'M' command - cursor movement (only 8 and 9 from device)
    'mode': [],          // 'S' command - mode switch / menu control
    'blink': [],         // 'B' command - pen state from triple blink
    'j': [],             // 'J' command - jaw timer (only for UI feedback)
  };

  return {
    on: (event: string, callback: Function) => {
      if (listeners[event]) {
        listeners[event].push(callback);
      }
    },
    off: (event: string, callback: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(cb => cb !== callback);
      }
    },
    emit: (event: string, data: any) => {
      if (listeners[event]) {
        listeners[event].forEach(callback => callback(data));
      }
    }
  };
};

const bleEmitter = createBLEEventEmitter();

// Menu structure - Undo/Redo now clearly in first menu at top
const MENU_LEVELS: MenuLevel[] = [
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
      { id: 'pen-enable', name: 'Pen Enable', icon: '✏️', action: 'pen-1' },
      { id: 'eraser-enable', name: 'Eraser Enable', icon: '🧽', action: 'pen-2' },
      { id: 'pen-disable', name: 'Pen Disable', icon: '🚫', action: 'pen-0' },
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
      { id: 'practice-game', name: 'Start Practice Game', icon: '🎮', action: 'practice-game' },
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

const EEGWhiteboard = () => {
  // State variables
  const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothDevice | null>(null);
  const [characteristic, setCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Add state for cursor pixel position
  const [cursorPixelPosition, setCursorPixelPosition] = useState({ x: 0, y: 0 });

  const [cursorX, setCursorX] = useState(0);
  const [cursorY, setCursorY] = useState(0);
  const [currentMode, setCurrentMode] = useState<DrawingMode>(0);
  const [penState, setPenState] = useState<PenState>(0);
  const [menuActive, setMenuActive] = useState(false);
  const [menuLevel, setMenuLevel] = useState(0);
  const gridRef = useRef<boolean[][]>([]);

  // Store last selection for each menu level
  const [menuSelections, setMenuSelections] = useState<Record<number, number>>({
    0: 0, // Level 0 default to first item (Undo)
    1: 0,
    2: 0
  });

  // Single source of truth for history - using ref for immediate access
  const historyRef = useRef<BoardState[]>([]);
  const historyIndexRef = useRef<number>(-1);

  const maxHistorySize = 100;

  // Current menu selection (derived from menuSelections)
  const menuSelection = menuSelections[menuLevel] || 0;

  const [jawTimerActive, setJawTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [drawnCount, setDrawnCount] = useState(0);
  const [lastActionTime, setLastActionTime] = useState(Date.now());
  const [connected, setConnected] = useState(false);
  const [grid, setGrid] = useState<boolean[][]>([]);
  const [commandLog, setCommandLog] = useState<string[]>([
    'System initialized. Waiting for BLE connection...',
    'Connect to "ESP32C6_EEG" via Bluetooth',
    'Device sends: M (8/9), S (mode), B (blink), J (jaw)',
    'Modes: Horizontal, Vertical, Diagonal NW-SE, Diagonal NE-SW',
    'Triple blink cycles: Disabled → Pen → Eraser → Disabled',
    'S command: When menu closed → changes drawing mode',
    'S command: When menu open → switches menu levels',
    'Menu auto-closes after 2 seconds of inactivity',
    'In menu: M(8/9) to navigate, stay on option for 2s to select',
  ]);
  const [cellSize, setCellSize] = useState(24);
  
  // Shape drawing state
  const [selectedShape, setSelectedShape] = useState<ShapeType>(null);
  const [shapeInitialPoint, setShapeInitialPoint] = useState<{ x: number; y: number } | null>(null);
  const [shapeDrawingMode, setShapeDrawingMode] = useState(false);

  // Grid dimensions from Whiteboard
  const [gridDimensions, setGridDimensions] = useState({ columns: 0, rows: 0 });

  // Game tutorial state
  const [showGameTutorial, setShowGameTutorial] = useState(true);
  const [windowSize, setWindowSize] = useState({ width: 1920, height: 1080 });

  // Menu timeout refs
  const menuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const selectionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs
  const lastMoveTime = useRef(0);
  const moveDelay = useRef(200);

  // State refs
  const cursorXRef = useRef(cursorX);
  const cursorYRef = useRef(cursorY);
  const currentModeRef = useRef<DrawingMode>(currentMode);
  const penStateRef = useRef<PenState>(penState);
  const menuActiveRef = useRef(menuActive);
  const menuLevelRef = useRef(menuLevel);
  const menuSelectionsRef = useRef(menuSelections);
  const gridDimensionsRef = useRef(gridDimensions);
  const selectedShapeRef = useRef(selectedShape);
  const shapeInitialPointRef = useRef(shapeInitialPoint);
  const shapeDrawingModeRef = useRef(shapeDrawingMode);

  // Force re-render counter for undo/redo
  const [, setUpdateCounter] = useState(0);

  // Flag to track if initial state has been saved
  const initialSaveDoneRef = useRef(false);

  useEffect(() => {
    if (gridContainerRef.current && gridDimensions.columns > 0 && gridDimensions.rows > 0) {
      const container = gridContainerRef.current;
      const rect = container.getBoundingClientRect();

      // Calculate actual cell size
      const cellWidth = rect.width / gridDimensions.columns;
      const cellHeight = rect.height / gridDimensions.rows;

      // Calculate cursor position in pixels
      const pixelX = rect.left + (cursorX * cellWidth) + (cellWidth / 2);
      const pixelY = rect.top + (cursorY * cellHeight) + (cellHeight / 2);

      setCursorPixelPosition({ x: pixelX, y: pixelY });
    }
  }, [cursorX, cursorY, gridDimensions]);

  // Update refs
  useEffect(() => {
    cursorXRef.current = cursorX;
    cursorYRef.current = cursorY;
    currentModeRef.current = currentMode;
    penStateRef.current = penState;
    menuActiveRef.current = menuActive;
    menuLevelRef.current = menuLevel;
    menuSelectionsRef.current = menuSelections;
    gridDimensionsRef.current = gridDimensions;
    selectedShapeRef.current = selectedShape;
    shapeInitialPointRef.current = shapeInitialPoint;
    shapeDrawingModeRef.current = shapeDrawingMode;
  }, [cursorX, cursorY, currentMode, penState, menuActive, menuLevel, menuSelections, gridDimensions, selectedShape, shapeInitialPoint, shapeDrawingMode]);

  // Track window size
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Log command
  const logCommand = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setCommandLog(prev => [...prev.slice(-19), `[${timestamp}] ${message}`]);
  }, []);

  // Get mode name
  const getModeName = useCallback((mode?: number): string => {
    const m = mode ?? currentMode;
    switch (m) {
      case 0: return 'Horizontal';
      case 1: return 'Vertical';
      case 2: return 'Diagonal NW-SE';
      case 3: return 'Diagonal NE-SW';
      default: return 'Unknown';
    }
  }, [currentMode]);

  // Save state to history
  const saveState = useCallback(() => {
    if (grid.length === 0 || grid[0]?.length === 0) return;

    const state: BoardState = {
      board: grid.map(row => [...row]),
      cursorX,
      cursorY,
      currentMode,
      penState,
      menuActive,
      menuLevel,
      menuSelection,
      timestamp: Date.now(),
    };

    // If we're not at the end, remove future states
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    }
    
    // Add new state
    historyRef.current.push(state);
    historyIndexRef.current++;

    // Limit history size
    if (historyRef.current.length > maxHistorySize) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }

    console.log('State saved. Index:', historyIndexRef.current, 'Length:', historyRef.current.length);
  }, [grid, cursorX, cursorY, currentMode, penState, menuActive, menuLevel, menuSelection]);

  // Save initial state when grid is first created
  useEffect(() => {
    if (grid.length > 0 && grid[0]?.length > 0 && !initialSaveDoneRef.current) {
      // Save initial state
      const initialState: BoardState = {
        board: grid.map(row => [...row]),
        cursorX,
        cursorY,
        currentMode,
        penState,
        menuActive,
        menuLevel,
        menuSelection,
        timestamp: Date.now(),
      };
      
      historyRef.current = [initialState];
      historyIndexRef.current = 0;
      initialSaveDoneRef.current = true;
      
      console.log('Initial state saved');
    }
  }, [grid, cursorX, cursorY, currentMode, penState, menuActive, menuLevel, menuSelection]);

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
          logCommand('⏰ Menu auto-closed (2s timeout)');
        }
      }, 2000);
    }
  }, [logCommand]);

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
        const currentLevel = MENU_LEVELS[menuLevelRef.current];
        const selectedItem = currentLevel.items[menuSelectionsRef.current[menuLevelRef.current]];

        if (selectedItem) {
          executeMenuAction(selectedItem.action);
          logCommand(`✅ Auto-selected: ${selectedItem.name} (2s hover)`);

          // Don't auto-close for exit action
          if (selectedItem.action !== 'exit') {
            setMenuActive(false);
          }
        }
      }
    }, 2000);
  }, [logCommand, resetSelectionTimer]);

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

  // Calculate number of pixels drawn for stats
  const calculateShapePixels = useCallback((
    shape: ShapeType,
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): number => {
    const width = Math.abs(end.x - start.x) + 1;
    const height = Math.abs(end.y - start.y) + 1;

    switch (shape) {
      case 'line':
        return Math.max(width, height);
      case 'rectangle':
        return 2 * (width + height) - 4;
      case 'triangle':
        return width + 2 * Math.sqrt(width * width / 4 + height * height);
      case 'pixel':
        return width * height;
      default:
        return 0;
    }
  }, []);

  // Draw shape
  const drawShape = useCallback((
    shape: ShapeType,
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) => {
    if (!shape) return;

    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    setGrid(prev => {
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

    setTimeout(() => {
      saveState();
      const pixelsDrawn = calculateShapePixels(shape, start, end);
      setDrawnCount(prev => prev + pixelsDrawn);
    }, 0);

    logCommand(`📐 Drew ${shape} from (${start.x},${start.y}) to (${end.x},${end.y})`);
  }, [saveState, logCommand, calculateShapePixels]);

  // Handle blink for shape point selection
  const handleBlinkForShape = useCallback((state: number) => {
    if (!shapeDrawingModeRef.current || !selectedShapeRef.current) {
      // Normal pen state change when not in shape drawing mode
      if (state >= 0 && state <= 2) {
        setPenState(state as PenState);
        setLastActionTime(Date.now());
        const stateName = state === 0 ? 'Disabled' : state === 1 ? 'Pen' : 'Eraser';
        logCommand(`✏️ Pen state changed to: ${stateName}`);
      }
      return;
    }

    // In shape drawing mode
    if (!shapeInitialPointRef.current) {
      // First blink - set initial point
      setShapeInitialPoint({ x: cursorXRef.current, y: cursorYRef.current });
      logCommand(`📍 Shape initial point set at (${cursorXRef.current}, ${cursorYRef.current})`);
    } else {
      // Second blink - draw shape from initial to current point
      drawShape(
        selectedShapeRef.current,
        shapeInitialPointRef.current,
        { x: cursorXRef.current, y: cursorYRef.current }
      );

      // Reset all shape drawing states
      setShapeInitialPoint(null);
      setPreviewShape(null);
      setShapeDrawingMode(false);
      setSelectedShape(null);

      // AUTO-DISABLE PEN after shape is drawn
      setPenState(0);

      logCommand(`✅ Shape completed - Pen auto-disabled`);
    }
  }, [drawShape, logCommand]);

  // Draw or erase at cursor
  const drawAtCursor = useCallback((x: number, y: number) => {
    const currentPenState = penStateRef.current;

    setGrid(prev => {
      const newGrid = [...prev.map(row => [...row])];
      if (newGrid[y] && newGrid[y][x] !== undefined) {
        if (currentPenState === 1) {
          if (!newGrid[y][x]) {
            newGrid[y][x] = true;
            return newGrid;
          }
        } else if (currentPenState === 2) {
          if (newGrid[y][x]) {
            newGrid[y][x] = false;
            return newGrid;
          }
        }
      }
      return prev;
    });

    if (currentPenState === 1) {
      setDrawnCount(prev => prev + 1);
    } else if (currentPenState === 2) {
      setDrawnCount(prev => Math.max(0, prev - 1));
    }

    saveState();
    setLastActionTime(Date.now());
    logCommand(`🎨 ${currentPenState === 1 ? 'Drew' : 'Erased'} at (${x}, ${y})`);
  }, [saveState, logCommand]);

  const [previewShape, setPreviewShape] = useState<{
    start: { x: number; y: number };
    current: { x: number; y: number };
    shape: ShapeType;
  } | null>(null);

  // Add preview ref
  const previewShapeRef = useRef(previewShape);

  // Update preview ref
  useEffect(() => {
    previewShapeRef.current = previewShape;
  }, [previewShape]);

  // Handle movement for main app (M command - only 8 and 9 from device)
  const handleMovement = useCallback((direction: number) => {
    // Only handle 8 and 9 as per device specification
    if (direction !== 8 && direction !== 9) {
      return;
    }

    if (menuActiveRef.current) {
      // In menu: map 8 and 9 to up/down navigation
      const currentLevel = MENU_LEVELS[menuLevelRef.current];
      const itemsCount = currentLevel.items.length;
      let newSelection = menuSelectionsRef.current[menuLevelRef.current];

      if (direction === 8) { // Device sends 8 for one direction (map to Up/Previous)
        newSelection = (menuSelectionsRef.current[menuLevelRef.current] - 1 + itemsCount) % itemsCount;
      } else if (direction === 9) { // Device sends 9 for other direction (map to Down/Next)
        newSelection = (menuSelectionsRef.current[menuLevelRef.current] + 1) % itemsCount;
      }

      // Update the selection for current level
      setMenuSelections(prev => ({
        ...prev,
        [menuLevelRef.current]: newSelection
      }));

      logCommand(`⬆️⬇️ Menu navigation to item ${newSelection + 1}`);

      // Reset menu timeout on any movement
      resetMenuTimeout();

      // Reset and restart selection timer for new item
      resetSelectionTimer();
      startSelectionTimer();

      return;
    }

    // Not in menu: move cursor on whiteboard (original functionality)
    const now = Date.now();
    if (lastMoveTime.current && (now - lastMoveTime.current) < moveDelay.current) return;
    lastMoveTime.current = now;

    const currentModeValue = currentModeRef.current;
    const currentX = cursorXRef.current;
    const currentY = cursorYRef.current;
    const currentPenState = penStateRef.current;
    const { columns, rows } = gridDimensionsRef.current;

    // Don't move if grid dimensions aren't set yet
    if (columns === 0 || rows === 0) {
      console.warn('Grid dimensions not set yet');
      return;
    }

    let newX = currentX;
    let newY = currentY;
    let moved = false;

    // Map firmware direction values (8 and 9 only) to cursor movement based on current mode
    switch (currentModeValue) {
      case 0: // Horizontal mode
        if (direction === 9) { // Left
          newX = Math.max(0, currentX - 1);
          moved = true;
        } else if (direction === 8) { // Right
          newX = Math.min(columns - 1, currentX + 1);
          moved = true;
        }
        break;

      case 1: // Vertical mode
        if (direction === 8) { // Up
          newY = Math.max(0, currentY - 1);
          moved = true;
        } else if (direction === 9) { // Down
          newY = Math.min(rows - 1, currentY + 1);
          moved = true;
        }
        break;

      case 2: // Diagonal NW-SE mode
        if (direction === 9) { // NW (up-left)
          newX = Math.max(0, currentX - 1);
          newY = Math.max(0, currentY - 1);
          moved = true;
        } else if (direction === 8) { // SE (down-right)
          newX = Math.min(columns - 1, currentX + 1);
          newY = Math.min(rows - 1, currentY + 1);
          moved = true;
        }
        break;

      case 3: // Diagonal NE-SW mode
        if (direction === 8) { // NE (up-right)
          newX = Math.min(columns - 1, currentX + 1);
          newY = Math.max(0, currentY - 1);
          moved = true;
        } else if (direction === 9) { // SW (down-left)
          newX = Math.max(0, currentX - 1);
          newY = Math.min(rows - 1, currentY + 1);
          moved = true;
        }
        break;
    }

    if (moved) {
      const positionChanged = newX !== currentX || newY !== currentY;
      if (positionChanged) {
        if (newX !== currentX) setCursorX(newX);
        if (newY !== currentY) setCursorY(newY);

        // Update shape preview if in shape drawing mode with start point set
        if (shapeDrawingModeRef.current && shapeInitialPointRef.current) {
          setPreviewShape({
            start: shapeInitialPointRef.current,
            current: { x: newX, y: newY },
            shape: selectedShapeRef.current!
          });
        }

        // Draw only if pen is enabled (state 1 or 2) and not in shape drawing mode
        if (currentPenState !== 0 && !shapeDrawingModeRef.current) {
          drawAtCursor(newX, newY);
        }

        saveState();
        setLastActionTime(Date.now());
      }
    }
  }, [drawAtCursor, saveState, logCommand, resetMenuTimeout, resetSelectionTimer, startSelectionTimer]);

  // Handle mode switch / menu control (S command)
  const handleModeSwitch = useCallback((mode: number) => {
    if (menuActiveRef.current) {
      // If menu is active: switch between menu levels
      const newLevel = (menuLevelRef.current + 1) % MENU_LEVELS.length;
      setMenuLevel(newLevel);
      logCommand(`📂 Menu level: ${MENU_LEVELS[newLevel].name} (Selection: ${menuSelections[newLevel] + 1})`);
      resetMenuTimeout();

      // Reset and restart selection timer for current item of new level
      resetSelectionTimer();
      startSelectionTimer();
    } else {
      // If menu is not active: S command OPENS THE MENU
      setMenuActive(true);
      logCommand(`📋 Menu opened at level ${menuLevel + 1} - ${MENU_LEVELS[menuLevel].name}`);

      // IMPORTANT: Reset timeout immediately after opening menu
      setTimeout(() => {
        resetMenuTimeout();
      }, 0);

      // Start selection timer for current item
      startSelectionTimer();
    }
  }, [logCommand, resetMenuTimeout, resetSelectionTimer, startSelectionTimer, menuLevel, menuSelections]);

  useEffect(() => {
    if (menuActive) {
      // Reset timeout when menu becomes active
      resetMenuTimeout();
    } else {
      // Clear timeout when menu becomes inactive
      if (menuTimeoutRef.current) {
        clearTimeout(menuTimeoutRef.current);
        menuTimeoutRef.current = null;
      }
    }
  }, [menuActive, resetMenuTimeout]);

  // Handle jaw timer (J command) - ONLY FOR UI FEEDBACK
  const handleJawTimer = useCallback((seconds: number) => {
    setJawTimerActive(seconds > 0);
    setTimerSeconds(seconds);

    if (seconds > 0) {
      logCommand(`🦷 Jaw timer: ${seconds}s`);
    }
  }, [logCommand]);

  interface CharacteristicEvent extends Event {
    target: EventTarget & {
      value?: DataView;
    };
  }

  // Handle BLE data - only M, S, B, J from actual device
  const handleBLEData = useCallback((event: Event) => {
    // Type guard to check if it's a CharacteristicEvent
    const isCharacteristicEvent = (evt: Event): evt is CharacteristicEvent => {
      return evt.target !== null && 'value' in evt.target;
    };

    if (!isCharacteristicEvent(event)) {
      return;
    }

    const value = event.target.value;
    if (!value) {
      return;
    }

    const data = new Uint8Array(value.buffer);

    if (data.length < 2) {
      return;
    }

    const command = String.fromCharCode(data[0]);
    const valueData = data[1];

    logCommand(`📨 Received: ${command}${valueData}`);

    // Emit events based on firmware commands
    switch (command) {
      case 'M':
        bleEmitter.emit('movement', valueData);
        break;
      case 'S':
        bleEmitter.emit('mode', valueData);
        break;
      case 'B':
        bleEmitter.emit('blink', valueData);
        break;
      case 'J':
        bleEmitter.emit('j', valueData);
        break;
      default:
    }
  }, [logCommand]);

  // Setup BLE event listeners for main app
  useEffect(() => {
    if (showGameTutorial) {
      return;
    }

    const handleBLEMovement = (direction: number) => {
      handleMovement(direction);
    };

    const handleBLEModeSwitch = (mode: number) => {
      handleModeSwitch(mode);
    };

    const handleBLEPenState = (state: number) => {
      handleBlinkForShape(state);
    };

    const handleBLEJawTimer = (seconds: number) => {
      handleJawTimer(seconds);
    };

    bleEmitter.on('movement', handleBLEMovement);
    bleEmitter.on('mode', handleBLEModeSwitch);
    bleEmitter.on('blink', handleBLEPenState);
    bleEmitter.on('j', handleBLEJawTimer);

    return () => {
      bleEmitter.off('movement', handleBLEMovement);
      bleEmitter.off('mode', handleBLEModeSwitch);
      bleEmitter.off('blink', handleBLEPenState);
      bleEmitter.off('j', handleBLEJawTimer);
    };
  }, [showGameTutorial, handleMovement, handleModeSwitch, handleBlinkForShape, handleJawTimer]);

  // BLE connection
  const connectToBLE = async () => {
    try {
      if (!navigator.bluetooth) {
        throw new Error('Bluetooth not supported');
      }

      logCommand('🔗 Searching for ESP32C6_EEG...');

      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { name: 'ESP32C6_EEG' },
          { namePrefix: 'ESP32' }
        ],
        optionalServices: ['6910123a-eb0d-4c35-9a60-bebe1dcb549d'],
      });

      logCommand(`✅ Found device: ${device.name}`);
      setBluetoothDevice(device);

      device.addEventListener('gattserverdisconnected', () => {
        logCommand('🔌 Device disconnected');
        setConnected(false);
        setCharacteristic(null);
      });

      logCommand('🔗 Connecting to GATT server...');
      const server = await device.gatt.connect();
      logCommand('✅ GATT server connected');

      logCommand('🔍 Getting primary service...');
      const service = await server.getPrimaryService('6910123a-eb0d-4c35-9a60-bebe1dcb549d');
      logCommand('✅ Service found');

      logCommand('🔍 Getting characteristic...');
      const characteristic = await service.getCharacteristic('5f4f1107-7fc1-43b2-a540-0aa1a9f1ce78');
      logCommand('✅ Characteristic found');

      if (characteristic.properties.notify) {
        try {
          await characteristic.startNotifications();
          logCommand('✅ Notifications started');

          characteristic.addEventListener('characteristicvaluechanged', handleBLEData);

          setCharacteristic(characteristic);
          setConnected(true);
          logCommand('✅ Connected and receiving notifications!');
        } catch (notifyError) {
          console.error('Failed to start notifications:', notifyError);
          setCharacteristic(characteristic);
          setConnected(true);
          startPolling(characteristic);
        }
      } else {
        logCommand('⚠️ Characteristic does not support notifications, using polling');
        setCharacteristic(characteristic);
        setConnected(true);
        startPolling(characteristic);
      }

    } catch (error) {
      console.error('Bluetooth connection failed:', error);
      setConnected(false);

      if (error instanceof Error) {
        logCommand(`❌ Connection failed: ${error.message}`);
      }
    }
  };

  // Polling function
  const startPolling = (characteristic: BluetoothRemoteGATTCharacteristic) => {
    logCommand('🔄 Starting polling (every 200ms)');

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = setInterval(async () => {
      if (!connected || !characteristic) return;

      try {
        const value = await characteristic.readValue();
        if (value && value.byteLength > 0) {
          const fakeEvent = { target: { value } } as unknown as Event;
          handleBLEData(fakeEvent);
        }
      } catch (error) {
        console.error('Polling read failed:', error);
      }
    }, 200);
  };

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (menuTimeoutRef.current) {
        clearTimeout(menuTimeoutRef.current);
      }
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current);
      }
    };
  }, []);

  // Disconnect
  const disconnect = () => {
    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
      bluetoothDevice.gatt.disconnect();
    }
    setConnected(false);
    setBluetoothDevice(null);
    setCharacteristic(null);
    logCommand('🔌 Disconnected from device');
  };

  const handleGridDimensionsUpdate = useCallback((columns: number, rows: number) => {
    console.log('Grid dimensions update:', { columns, rows, currentGrid: grid });
    setGridDimensions({ columns, rows });

    // Only create new grid if current grid is empty or dimensions don't match
    if (grid.length === 0) {
      console.log('First time initialization - creating empty grid');
      const newGrid = Array(rows).fill(null).map(() =>
        Array(columns).fill(false)
      );
      setGrid(newGrid);
    } else if (grid[0]?.length !== columns || grid.length !== rows) {
      console.log('Resizing grid from', { oldCols: grid[0]?.length, oldRows: grid.length }, 'to', { columns, rows });
      // Dimensions changed - need to resize grid while preserving data
      setGrid(prev => {
        const newGrid = Array(rows).fill(null).map(() =>
          Array(columns).fill(false)
        );

        // Copy existing data where possible
        for (let y = 0; y < Math.min(prev.length, rows); y++) {
          for (let x = 0; x < Math.min(prev[0]?.length || 0, columns); x++) {
            if (prev[y] && prev[y][x] !== undefined) {
              newGrid[y][x] = prev[y][x];
            }
          }
        }

        console.log('New grid created:', newGrid);
        return newGrid;
      });
    }

    // Adjust cursor if out of bounds
    if (cursorX >= columns) {
      setCursorX(Math.max(0, columns - 1));
    }
    if (cursorY >= rows) {
      setCursorY(Math.max(0, rows - 1));
    }
  }, [grid, cursorX, cursorY]);

  const handleGridUpdate = useCallback((x: number, y: number, value: boolean) => {
    setGrid(prev => {
      const newGrid = [...prev.map(row => [...row])];
      if (newGrid[y] && newGrid[y][x] !== undefined) {
        newGrid[y][x] = value;
      }
      return newGrid;
    });
    saveState();
  }, [saveState]);

  // Save drawing with screenshot
  const saveDrawingWithScreenshot = async () => {
    const currentGrid = gridRef.current;
    const currentGridDimensions = gridDimensionsRef.current;

    console.log('Saving grid:', currentGrid);
    console.log('Grid dimensions:', currentGridDimensions);

    if (currentGrid && currentGrid.length > 0) {
      console.log('First row length:', currentGrid[0]?.length);
    }

    // Create a clean copy of the grid data
    const gridCopy = currentGrid.map(row => [...row]);

    const drawingData = {
      grid: gridCopy,
      cursor: { x: cursorXRef.current, y: cursorYRef.current },
      mode: currentModeRef.current,
      penState: penStateRef.current,
      timestamp: new Date().toISOString(),
      dimensions: currentGridDimensions,
      shapeDrawingMode: shapeDrawingModeRef.current,
      selectedShape: selectedShapeRef.current
    };

    try {
      // First, save the JSON file
      const jsonString = JSON.stringify(drawingData, null, 2);
      const jsonBlob = new Blob([jsonString], { type: 'application/json' });
      const jsonUrl = URL.createObjectURL(jsonBlob);

      // Get the filename base with timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filenameBase = `neuroart-${timestamp}`;

      // Create JSON download link
      const jsonLink = document.createElement('a');
      jsonLink.href = jsonUrl;
      jsonLink.download = `${filenameBase}.json`;

      logCommand('📸 Capturing screenshot with dom-to-image...');

      // Find the whiteboard container div
      const whiteboardContainer = document.querySelector('[data-whiteboard-container="true"]');

      if (whiteboardContainer) {
        try {
          // Use dom-to-image to capture the whiteboard
          const options = {
            bgcolor: '#111827',
            style: {
              'background-color': '#111827',
              'transform': 'scale(1)',
              'transform-origin': 'top left'
            },
            filter: (node: Node) => {
              if (node instanceof HTMLElement) {
                return true;
              }
              return true;
            }
          };

          const dataUrl = await domtoimage.toPng(whiteboardContainer as HTMLElement, options);
          const response = await fetch(dataUrl);
          const blob = await response.blob();
          const screenshotUrl = URL.createObjectURL(blob);
          const screenshotLink = document.createElement('a');
          screenshotLink.href = screenshotUrl;
          screenshotLink.download = `${filenameBase}.png`;

          document.body.appendChild(jsonLink);
          jsonLink.click();
          document.body.removeChild(jsonLink);

          await new Promise(resolve => setTimeout(resolve, 200));

          document.body.appendChild(screenshotLink);
          screenshotLink.click();
          document.body.removeChild(screenshotLink);

          URL.revokeObjectURL(jsonUrl);
          URL.revokeObjectURL(screenshotUrl);

          console.log('Save successful! JSON size:', jsonBlob.size, 'bytes, Screenshot captured');
          setMenuActive(false);
          logCommand('💾 Drawing saved with screenshot');

        } catch (domToImageError) {
          console.error('dom-to-image failed:', domToImageError);
          logCommand(`⚠️ Screenshot failed: ${domToImageError instanceof Error ? domToImageError.message : 'Unknown error'}`);

          try {
            logCommand('🔄 Retrying screenshot with simplified options...');

            const fallbackOptions = {
              bgcolor: '#111827',
              quality: 1
            };

            const dataUrl = await domtoimage.toPng(whiteboardContainer as HTMLElement, fallbackOptions);
            const response = await fetch(dataUrl);
            const blob = await response.blob();
            const screenshotUrl = URL.createObjectURL(blob);
            const screenshotLink = document.createElement('a');
            screenshotLink.href = screenshotUrl;
            screenshotLink.download = `${filenameBase}.png`;

            document.body.appendChild(jsonLink);
            jsonLink.click();
            document.body.removeChild(jsonLink);

            await new Promise(resolve => setTimeout(resolve, 200));

            document.body.appendChild(screenshotLink);
            screenshotLink.click();
            document.body.removeChild(screenshotLink);

            URL.revokeObjectURL(jsonUrl);
            URL.revokeObjectURL(screenshotUrl);

            setMenuActive(false);
            logCommand('💾 Drawing saved with screenshot (fallback method)');

          } catch (fallbackError) {
            console.error('Fallback screenshot also failed:', fallbackError);
            document.body.appendChild(jsonLink);
            jsonLink.click();
            document.body.removeChild(jsonLink);
            URL.revokeObjectURL(jsonUrl);

            setMenuActive(false);
            logCommand('💾 Drawing saved (JSON only - screenshot failed)');
          }
        }
      } else {
        document.body.appendChild(jsonLink);
        jsonLink.click();
        document.body.removeChild(jsonLink);
        URL.revokeObjectURL(jsonUrl);

        setMenuActive(false);
        logCommand('💾 Drawing saved (screenshot not available)');
      }
    } catch (error) {
      console.error('Save failed:', error);
      logCommand(`❌ Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

      try {
        const jsonString = JSON.stringify(drawingData, null, 2);
        const jsonBlob = new Blob([jsonString], { type: 'application/json' });
        const jsonUrl = URL.createObjectURL(jsonBlob);
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filenameBase = `neuroart-${timestamp}`;

        const jsonLink = document.createElement('a');
        jsonLink.href = jsonUrl;
        jsonLink.download = `${filenameBase}.json`;

        document.body.appendChild(jsonLink);
        jsonLink.click();
        document.body.removeChild(jsonLink);
        URL.revokeObjectURL(jsonUrl);

        setMenuActive(false);
        logCommand('💾 Drawing saved (JSON only - emergency fallback)');
      } catch (jsonError) {
        console.error('Even JSON save failed:', jsonError);
        logCommand('❌ Complete save failure');
      }
    }
  };

  // Execute menu action
  const executeMenuAction = useCallback((action: string) => {
    switch (action) {
      // Mode changes
      case 'mode-horizontal':
        setCurrentMode(0);
        logCommand('↔️ Mode: Horizontal');
        break;
      case 'mode-vertical':
        setCurrentMode(1);
        logCommand('↕️ Mode: Vertical');
        break;
      case 'mode-diagonal-nw-se':
        setCurrentMode(2);
        logCommand('↖️ Mode: Diagonal NW-SE');
        break;
      case 'mode-diagonal-ne-sw':
        setCurrentMode(3);
        logCommand('↗️ Mode: Diagonal NE-SW');
        break;

      // Pen states
      case 'pen-0':
        setPenState(0);
        logCommand('🚫 Pen disabled');
        break;
      case 'pen-1':
        setPenState(1);
        logCommand('✏️ Pen enabled');
        break;
      case 'pen-2':
        setPenState(2);
        logCommand('🧽 Eraser enabled');
        break;

      // UNDO action
      case 'undo':
        if (historyIndexRef.current > 0) {
          historyIndexRef.current--;
          const state = historyRef.current[historyIndexRef.current];
          
          setGrid(state.board || []);
          setCursorX(state.cursorX);
          setCursorY(state.cursorY);
          setCurrentMode(state.currentMode);
          setPenState(state.penState);
          setMenuActive(false);
          
          // Force re-render
          setUpdateCounter(prev => prev + 1);
          
          console.log('Undo - New index:', historyIndexRef.current);
          logCommand('↶ Undo completed');
        } else {
          logCommand('⚠️ Nothing to undo');
        }
        break;

      // REDO action
      case 'redo':
        if (historyIndexRef.current < historyRef.current.length - 1) {
          historyIndexRef.current++;
          const state = historyRef.current[historyIndexRef.current];
          
          setGrid(state.board || []);
          setCursorX(state.cursorX);
          setCursorY(state.cursorY);
          setCurrentMode(state.currentMode);
          setPenState(state.penState);
          setMenuActive(false);
          
          // Force re-render
          setUpdateCounter(prev => prev + 1);
          
          console.log('Redo - New index:', historyIndexRef.current);
          logCommand('↷ Redo completed');
        } else {
          logCommand('⚠️ Nothing to redo');
        }
        break;

      case 'practice-game':
        setShowGameTutorial(true);
        setMenuActive(false);
        logCommand('🎮 Starting Practice Game');
        break;

      // Shape tools
      case 'shape-line':
        setSelectedShape('line');
        setShapeDrawingMode(true);
        setShapeInitialPoint(null);
        setPreviewShape(null);
        setPenState(1);
        setMenuActive(false);
        logCommand('📏 Line tool selected - Pen enabled - Blink to set start point');
        break;
      case 'shape-rect':
        setSelectedShape('rectangle');
        setShapeDrawingMode(true);
        setShapeInitialPoint(null);
        setPreviewShape(null);
        setPenState(1);
        setMenuActive(false);
        logCommand('⬜ Rectangle tool selected - Pen enabled - Blink to set start point');
        break;
      case 'shape-tri':
        setSelectedShape('triangle');
        setShapeDrawingMode(true);
        setShapeInitialPoint(null);
        setPreviewShape(null);
        setPenState(1);
        setMenuActive(false);
        logCommand('🔺 Triangle tool selected - Pen enabled - Blink to set start point');
        break;
      case 'shape-pixel':
        setSelectedShape('pixel');
        setShapeDrawingMode(true);
        setShapeInitialPoint(null);
        setPreviewShape(null);
        setPenState(1);
        setMenuActive(false);
        logCommand('🔲 Pixel mode selected - Pen enabled - Blink to set start point');
        break;

      case 'shape-cancel':
        setShapeDrawingMode(false);
        setSelectedShape(null);
        setShapeInitialPoint(null);
        setPreviewShape(null);
        setPenState(0);
        setMenuActive(false);
        logCommand('❌ Shape drawing cancelled - Pen disabled');
        break;

      // File operations
      case 'save':
        saveDrawingWithScreenshot();
        break;
      case 'exit':
        setMenuActive(false);
        logCommand('❌ Menu closed');
        break;

      case 'new':
        setGrid(prev => prev.map(row => row.map(() => false)));
        setDrawnCount(0);
        setShapeDrawingMode(false);
        setSelectedShape(null);
        setShapeInitialPoint(null);
        setPreviewShape(null);
        setPenState(0);
        saveState();
        setMenuActive(false);
        logCommand('🆕 New board created - Pen disabled');
        break;

      case 'clear':
        setGrid(prev => prev.map(row => row.map(() => false)));
        setDrawnCount(0);
        setShapeDrawingMode(false);
        setSelectedShape(null);
        setShapeInitialPoint(null);
        setPreviewShape(null);
        setPenState(0);
        saveState();
        setMenuActive(false);
        logCommand('🧹 Board cleared - Pen disabled');
        break;

      default:
    }
  }, [logCommand, saveState]);

  // Update refs
  useEffect(() => {
    cursorXRef.current = cursorX;
    cursorYRef.current = cursorY;
    currentModeRef.current = currentMode;
    penStateRef.current = penState;
    menuActiveRef.current = menuActive;
    menuLevelRef.current = menuLevel;
    menuSelectionsRef.current = menuSelections;
    gridDimensionsRef.current = gridDimensions;
    selectedShapeRef.current = selectedShape;
    shapeInitialPointRef.current = shapeInitialPoint;
    shapeDrawingModeRef.current = shapeDrawingMode;
    gridRef.current = grid;
  }, [cursorX, cursorY, currentMode, penState, menuActive, menuLevel, menuSelections, gridDimensions, selectedShape, shapeInitialPoint, shapeDrawingMode, grid]);

  // Add cancel handler for shape drawing
  const cancelShapeDrawing = useCallback(() => {
    setShapeDrawingMode(false);
    setSelectedShape(null);
    setShapeInitialPoint(null);
    setPreviewShape(null);
    setPenState(0);
    logCommand('❌ Shape drawing cancelled - Pen disabled');
  }, [logCommand]);

  // Get current menu items with proper actions
  const currentMenuItems = MENU_LEVELS[menuLevel]?.items.map(item => ({
    id: item.id,
    name: item.name,
    icon: item.icon,
    action: () => executeMenuAction(item.action)
  })) || [];

  // Shape Drawing Indicator Component
  const ShapeDrawingIndicator = () => {
    if (!shapeDrawingMode || !selectedShape) return null;

    return (
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
          <div className="ml-2 text-xs bg-red-500/30 px-2 py-1 rounded flex items-center gap-1">
            <span>Menu → Shapes → Cancel</span>
            <span className="text-red-300">❌</span>
          </div>
          <button
            onClick={cancelShapeDrawing}
            className="ml-2 text-white/80 hover:text-white"
            title="Cancel shape drawing"
          >
            ✕
          </button>
        </div>
      </div>
    );
  };

  // Debug useEffect to monitor history changes
  useEffect(() => {
    console.log('History updated - Index:', historyIndexRef.current, 'Length:', historyRef.current.length);
  }, [historyIndexRef.current, historyRef.current.length]);

  useEffect(() => {
    const updateCursorPixelPosition = () => {
      const gridContainer = document.querySelector('[data-grid-container="true"]');
      if (!gridContainer || gridDimensions.columns === 0 || gridDimensions.rows === 0) return;

      const rect = gridContainer.getBoundingClientRect();

      const cellWidth = rect.width / gridDimensions.columns;
      const cellHeight = rect.height / gridDimensions.rows;

      const pixelX = rect.left + (cursorX * cellWidth) + (cellWidth / 2);
      const pixelY = rect.top + (cursorY * cellHeight) + (cellHeight / 2);

      setCursorPixelPosition({ x: pixelX, y: pixelY });
    };

    updateCursorPixelPosition();

    const handleResize = () => {
      updateCursorPixelPosition();
    };

    window.addEventListener('resize', handleResize);

    const timeoutId = setTimeout(updateCursorPixelPosition, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, [cursorX, cursorY, gridDimensions]);

  // Undo handler for Header
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const state = historyRef.current[historyIndexRef.current];
      
      setGrid(state.board || []);
      setCursorX(state.cursorX);
      setCursorY(state.cursorY);
      setCurrentMode(state.currentMode);
      setPenState(state.penState);
      
      // Force re-render
      setUpdateCounter(prev => prev + 1);
      
      logCommand('↶ Undo');
    }
  }, [logCommand]);

  // Redo handler for Header
  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const state = historyRef.current[historyIndexRef.current];
      
      setGrid(state.board || []);
      setCursorX(state.cursorX);
      setCursorY(state.cursorY);
      setCurrentMode(state.currentMode);
      setPenState(state.penState);
      
      // Force re-render
      setUpdateCounter(prev => prev + 1);
      
      logCommand('↷ Redo');
    }
  }, [logCommand]);

  // Render Game or Main App
  if (showGameTutorial) {
    return (
      <GameTutorial
        onComplete={() => setShowGameTutorial(false)}
        onConnect={connectToBLE}
        onDisconnect={disconnect}
        connected={connected}
        onSkip={() => setShowGameTutorial(false)}
        bleConnected={connected}
        bleEmitter={bleEmitter}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen m-0 p-0 z-50 overflow-hidden">
      <ShapeDrawingIndicator />

      <Header
        connected={connected}
        currentMode={currentMode}
        penState={penState}
        onConnect={connectToBLE}
        onDisconnect={disconnect}
        onUndo={handleUndo}
        onRedo={handleRedo}
        showGame={() => setShowGameTutorial(true)}
        onClear={() => {
          setGrid(prev => prev.map(row => row.map(() => false)));
          setDrawnCount(0);
          setShapeDrawingMode(false);
          setSelectedShape(null);
          setShapeInitialPoint(null);
          setPreviewShape(null);
          saveState();
          logCommand('🧹 Board cleared');
        }}
        getModeName={getModeName}
        getModeSymbol={() => {
          switch (currentMode) {
            case 0: return '↔';
            case 1: return '↕';
            case 2: return '↖';
            case 3: return '↗';
            default: return '?';
          }
        }}
        getModeClass={() => {
          switch (currentMode) {
            case 0: return 'horizontal';
            case 1: return 'vertical';
            case 2: return 'diagonal-nw-se';
            case 3: return 'diagonal-ne-sw';
            default: return '';
          }
        }}
        getPenStateName={() => {
          switch (penState) {
            case 0: return 'Disabled';
            case 1: return 'Pen';
            case 2: return 'Eraser';
            default: return 'Unknown';
          }
        }}
      />

      {jawTimerActive && (
        <JawTimer seconds={timerSeconds} />
      )}

      <div className="flex-1 min-h-0 relative">
        <Whiteboard
          ref={gridContainerRef}
          cursorX={cursorX}
          cursorY={cursorY}
          currentMode={currentMode}
          penState={penState}
          menuActive={menuActive}
          onDotClick={(x, y) => {
            setCursorX(x);
            setCursorY(y);
            if (penState !== 0 && !shapeDrawingMode) {
              drawAtCursor(x, y);
            }
          }}
          grid={grid}
          onGridUpdate={handleGridUpdate}
          onGridDimensionsUpdate={handleGridDimensionsUpdate}
          shapePreview={previewShape}
        />
      </div>

      <MenuPopup
        active={menuActive}
        selection={menuSelection}
        items={currentMenuItems}
        level={menuLevel}
        levelName={MENU_LEVELS[menuLevel]?.name || ''}
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

      <div className="bg-black/60 backdrop-blur-lg border-t border-white/10 shrink-0 h-16">
        <div className="h-full max-w-[100vw] mx-auto px-3">
          <div className="flex h-full items-center justify-between">
            <p className="text-sm text-muted-foreground text-white">
              Made with ❤️ by <Link href="https://upsidedownlabs.tech/" target="_blank">
                Upside Down Labs
              </Link>
            </p>
            <div className="text-sm text-white/80">
              Grid: {gridDimensions.columns} × {gridDimensions.rows} | Cursor: ({cursorX}, {cursorY})
              {shapeDrawingMode && shapeInitialPoint && (
                <span className="ml-4 text-blue-400">
                  Preview Mode: {selectedShape}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EEGWhiteboard;
export { bleEmitter };