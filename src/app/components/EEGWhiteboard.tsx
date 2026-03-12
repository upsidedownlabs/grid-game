// components/EEGWhiteboard.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Header from './Header';
import Whiteboard from './Whiteboard';
import MenuPopup from './MenuPopup';
import JawTimer from './JawTimer';
import GameTutorial from './GameTutorial';
import { BoardState, MenuItem, DrawingMode, PenState, MenuLevel } from '../types';
import Link from "next/link";

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
  const history = useRef<BoardState[]>([]);
  const historyIndex = useRef(-1);
  const maxHistorySize = 100;

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
    //console.log(`Command Log: ${message}`);
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

  const saveState = useCallback(() => {
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

    history.current = history.current.slice(0, historyIndex.current + 1);
    history.current.push(state);

    if (history.current.length > maxHistorySize) {
      history.current.shift();
    } else {
      historyIndex.current++;
    }
  }, [grid, cursorX, cursorY, currentMode, penState, menuActive, menuLevel, menuSelection]);

  // Reset menu timeout
  const resetMenuTimeout = useCallback(() => {
    //console.log('Resetting menu timeout');

    if (menuTimeoutRef.current) {
      clearTimeout(menuTimeoutRef.current);
      menuTimeoutRef.current = null;
    }

    if (menuActiveRef.current) {
      //console.log('Setting new 2s timeout');
      menuTimeoutRef.current = setTimeout(() => {
        //console.log('Timeout executed, menuActive:', menuActiveRef.current);
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

    //console.log('Drawing shape:', shape, 'from', start, 'to', end, 'penState:', penStateRef.current);

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
      //console.log(`Shape completed, pixels drawn: ${pixelsDrawn}`);
    }, 0);

    logCommand(`📐 Drew ${shape} from (${start.x},${start.y}) to (${end.x},${end.y})`);
  }, [saveState, logCommand, calculateShapePixels]);

  // Handle blink for shape point selection
  const handleBlinkForShape = useCallback((state: number) => {
    //console.log('Blink received, state:', state, 'shapeDrawingMode:', shapeDrawingModeRef.current, 'selectedShape:', selectedShapeRef.current);

    if (!shapeDrawingModeRef.current || !selectedShapeRef.current) {
      // Normal pen state change when not in shape drawing mode
      if (state >= 0 && state <= 2) {
        setPenState(state as PenState);
        setLastActionTime(Date.now());
        const stateName = state === 0 ? 'Disabled' : state === 1 ? 'Pen' : 'Eraser';
        logCommand(`✏️ Pen state changed to: ${stateName}`);
        //console.log('Pen state changed to:', stateName);
      }
      return;
    }

    // In shape drawing mode
    if (!shapeInitialPointRef.current) {
      // First blink - set initial point
      setShapeInitialPoint({ x: cursorXRef.current, y: cursorYRef.current });
      logCommand(`📍 Shape initial point set at (${cursorXRef.current}, ${cursorYRef.current})`);
      //console.log('Shape initial point set');
    } else {
      // Second blink - draw shape from initial to current point
      //console.log('Drawing shape now...');
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
      //console.log('Shape completed, pen disabled');
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
      //console.log('Ignoring invalid direction:', direction);
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
      // Don't reset selection - use the stored selection for this level
      logCommand(`📂 Menu level: ${MENU_LEVELS[newLevel].name} (Selection: ${menuSelections[newLevel] + 1})`);
      resetMenuTimeout();

      // Reset and restart selection timer for current item of new level
      resetSelectionTimer();
      startSelectionTimer();
    } else {
      // If menu is not active: S command OPENS THE MENU
      //console.log('Opening menu');
      setMenuActive(true);
      // Keep the current level and selection (don't reset to 0)
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
    //console.log('Menu active changed to:', menuActive);

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
      // No menu actions from jaw clench
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
      //console.log('Unknown command:', command);
    }
  }, [logCommand]);

  // Setup BLE event listeners for main app
  useEffect(() => {
    if (showGameTutorial) {
      return;
    }

    const handleBLEMovement = (direction: number) => {
      //console.log('Main app: Movement event', direction);
      handleMovement(direction);
    };

    const handleBLEModeSwitch = (mode: number) => {
      //console.log('Main app: Mode switch event', mode);
      handleModeSwitch(mode);
    };

    const handleBLEPenState = (state: number) => {
      //console.log('Main app: Pen state event', state);
      handleBlinkForShape(state);
    };

    const handleBLEJawTimer = (seconds: number) => {
      //console.log('Main app: Jaw timer event', seconds);
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

  // BLE connection (keep existing connection code)
  const connectToBLE = async () => {
    try {
      if (!navigator.bluetooth) {
        throw new Error('Bluetooth not supported');
      }
      console.log('connectToBLE called at:', new Date().toISOString());
      console.trace(); // This will show the call stack

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

  // In handleGridDimensionsUpdate, add logging:
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

  // In executeMenuAction function, add the new case
  const executeMenuAction = useCallback((action: string) => {
    //console.log('Executing menu action:', action);

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
        if (historyIndex.current > 0) {
          historyIndex.current--;
          const state = history.current[historyIndex.current];
          setGrid(state.board || []);
          setCursorX(state.cursorX);
          setCursorY(state.cursorY);
          setCurrentMode(state.currentMode);
          setPenState(state.penState);
          setMenuActive(false);
          logCommand('↶ Undo completed');
        } else {
          logCommand('⚠️ Nothing to undo');
        }
        break;

      // REDO action
      case 'redo':
        if (historyIndex.current < history.current.length - 1) {
          historyIndex.current++;
          const state = history.current[historyIndex.current];
          setGrid(state.board || []);
          setCursorX(state.cursorX);
          setCursorY(state.cursorY);
          setCurrentMode(state.currentMode);
          setPenState(state.penState);
          setMenuActive(false);
          logCommand('↷ Redo completed');
        } else {
          logCommand('⚠️ Nothing to redo');
        }
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
        // Use refs to get current values
        const currentGrid = gridRef.current;
        const currentGridDimensions = gridDimensionsRef.current;

        console.log('Saving grid:', currentGrid);
        console.log('Grid dimensions:', currentGridDimensions);
        console.log('Grid length:', currentGrid?.length || 0);
        if (currentGrid && currentGrid.length > 0) {
          console.log('First row length:', currentGrid[0]?.length);
          console.log('Sample data:', currentGrid[0]?.slice(0, 5));
        }

        // Create a clean copy of the grid data
        const gridCopy = currentGrid.map(row => [...row]);

        const drawingData = {
          grid: gridCopy,
          cursor: { x: cursorXRef.current, y: cursorYRef.current },
          mode: currentModeRef.current,
          penState: penStateRef.current,
          timestamp: new Date().toISOString(),
          dimensions: currentGridDimensions // Add dimensions for reference
        };

        try {
          // Convert to JSON string
          const jsonString = JSON.stringify(drawingData, null, 2);

          // Create blob and download
          const blob = new Blob([jsonString], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `neuroart-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          console.log('Save successful! File size:', blob.size, 'bytes');
          setMenuActive(false);
          logCommand('💾 Drawing saved');
        } catch (error) {
          console.error('Save failed:', error);
        }
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
      //console.log('Unknown action:', action);
    }
  }, [grid, cursorX, cursorY, currentMode, penState, saveState, logCommand, history]);

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
    gridRef.current = grid; // Add this line
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

  // Shape Drawing Indicator Component - Updated with cancel hint
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
        onUndo={() => {
          if (historyIndex.current > 0) {
            historyIndex.current--;
            const state = history.current[historyIndex.current];
            setGrid(state.board || []);
            setCursorX(state.cursorX);
            setCursorY(state.cursorY);
            setCurrentMode(state.currentMode);
            setPenState(state.penState);
            logCommand('↶ Undo');
          }
        }}
        showGame={() => setShowGameTutorial(true)}
        onRedo={() => {
          if (historyIndex.current < history.current.length - 1) {
            historyIndex.current++;
            const state = history.current[historyIndex.current];
            setGrid(state.board || []);
            setCursorX(state.cursorX);
            setCursorY(state.cursorY);
            setCurrentMode(state.currentMode);
            setPenState(state.penState);
            logCommand('↷ Redo');
          }
        }}
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

      <div style={{ flex: '1 1 0%', minHeight: 0, position: 'relative' }}>
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

      <div className="bg-[#0C1330] backdrop-blur-lg border-t border-white/10 shrink-0" style={{ height: '64px' }}>
        <div className="h-full max-w-[100vw] mx-auto px-3">
          <div className="flex h-full items-center justify-between">
            <p className="text-xl text-muted-foreground text-white">
              Made with ❤️ by <Link href="https://upsidedownlabs.tech/" target="_blank">
                Upside Down Labs
              </Link>
            </p>
            <div className="text-xl text-white/80">
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