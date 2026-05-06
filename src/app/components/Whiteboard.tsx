'use client';

import React, { useState, useRef, useCallback, useLayoutEffect, useEffect,forwardRef,useImperativeHandle } from 'react';

interface WhiteboardProps {
  cursorX: number;
  cursorY: number;
  currentMode: number;
  penState: number; // 0 = disabled, 1 = pen, 2 = eraser
  menuActive: boolean;
  onDotClick: (x: number, y: number) => void;
  grid?: boolean[][];
  onGridUpdate?: (x: number, y: number, value: boolean) => void;
  onGridDimensionsUpdate?: (columns: number, rows: number) => void;
  fixedDotSize?: number;
  // FIX: Change shape type to accept string | null to match ShapeType from EEGWhiteboard
  shapePreview?: {
    start: { x: number; y: number };
    current: { x: number; y: number };
    shape: string | null;  // Changed from 'string' to 'string | null'
  } | null;
  onCellSizeChange?: (size: number) => void;
}

const Whiteboard = forwardRef<HTMLDivElement, WhiteboardProps>(({
  cursorX,
  cursorY,
  currentMode,
  penState,
  menuActive,
  onDotClick,
  grid: externalGrid,
  onGridUpdate,
  onGridDimensionsUpdate,
  fixedDotSize = 24,
  shapePreview,
  onCellSizeChange,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [internalGrid, setInternalGrid] = useState<boolean[][]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [dpr, setDpr] = useState(1);
  const [autoColumns, setAutoColumns] = useState(10);
  const [autoRows, setAutoRows] = useState(10);
  const [availableGridArea, setAvailableGridArea] = useState({ width: 0, height: 0 });
  const [calculatedDotSize, setCalculatedDotSize] = useState(fixedDotSize);
  
  useEffect(() => {
    if (onCellSizeChange && calculatedDotSize > 0) {
      onCellSizeChange(calculatedDotSize);
    }
  }, [calculatedDotSize, onCellSizeChange]);
  
  // Use external grid if provided, otherwise use internal grid
  const activeGrid = externalGrid || internalGrid;

  // Combine refs
  useImperativeHandle(ref, () => gridContainerRef.current!);
  
  // Calculate grid size and adjusted dot size to fill container exactly
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

  // Update dimensions and grid size
  const updateLayout = useCallback(() => {
    if (!containerRef.current || !gridContainerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const gridRect = gridContainerRef.current.getBoundingClientRect();

    const newDpr = window.devicePixelRatio || 1;
    setDpr(newDpr);

    const availableWidth = Math.max(100, gridRect.width);
    const availableHeight = Math.max(100, gridRect.height);

    const { columns, rows, dotSize } = calculateGridSize(availableWidth, availableHeight, fixedDotSize);

    setDimensions({
      width: containerRect.width,
      height: containerRect.height
    });

    setAvailableGridArea({
      width: availableWidth,
      height: availableHeight
    });

    setAutoColumns(columns);
    setAutoRows(rows);
    setCalculatedDotSize(dotSize);

    if (onGridDimensionsUpdate) {
      onGridDimensionsUpdate(columns, rows);
    }

    if (!externalGrid) {
      if (internalGrid.length !== rows || (internalGrid[0] && internalGrid[0].length !== columns)) {
        const newGrid = Array(rows).fill(null).map(() =>
          Array(columns).fill(false)
        );
        setInternalGrid(newGrid);
      }
    }
  }, [calculateGridSize, externalGrid, fixedDotSize, internalGrid, onGridDimensionsUpdate]);

  useLayoutEffect(() => {
    updateLayout();

    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        updateLayout();
      }, 50);
    };

    let currentDpr = window.devicePixelRatio || 1;
    const handleZoom = () => {
      const newDpr = window.devicePixelRatio || 1;
      if (Math.abs(newDpr - currentDpr) > 0.1) {
        currentDpr = newDpr;
        updateLayout();
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    if (gridContainerRef.current) {
      resizeObserver.observe(gridContainerRef.current);
    }

    window.addEventListener('resize', handleResize);
    window.addEventListener('zoom', handleZoom);

    const zoomCheckInterval = setInterval(handleZoom, 500);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(resizeTimeout);
      clearInterval(zoomCheckInterval);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('zoom', handleZoom);
    };
  }, [updateLayout]);

  const columns = autoColumns;
  const rows = autoRows;
  const gapSize = 0;
  const dotSize = calculatedDotSize;

  useEffect(() => {
    if (columns > 0 && rows > 0 && onGridDimensionsUpdate) {
      onGridDimensionsUpdate(columns, rows);
    }
  }, [columns, rows, onGridDimensionsUpdate]);

  useEffect(() => {
    if (externalGrid && externalGrid.length > 0) {
      setInternalGrid(prev => prev);
    }
  }, [externalGrid]);

  const calculateResponsiveValues = useCallback(() => {
    if (availableGridArea.width === 0 || availableGridArea.height === 0) {
      return { fontSize: 14, badgeSize: 20 };
    }

    const scale = Math.min(availableGridArea.width / 600, availableGridArea.height / 400);
    const fontSize = Math.max(10, Math.min(16 * scale, 18));

    if (dpr > 1.5) {
      return { fontSize: fontSize * 1.1, badgeSize: 24 };
    }

    if (availableGridArea.width < 400) {
      return { fontSize: Math.max(9, fontSize * 0.9), badgeSize: 18 };
    }

    return { fontSize, badgeSize: 22 };
  }, [availableGridArea, dpr]);

  const responsiveValues = calculateResponsiveValues();
  const { fontSize } = responsiveValues;

  const handleDotClick = (x: number, y: number) => {
    if (!menuActive) {
      if (penState !== 0 && onGridUpdate) {
        const currentValue = activeGrid[y]?.[x] || false;
        if (penState === 1 && !currentValue) {
          onGridUpdate(x, y, true);
        } else if (penState === 2 && currentValue) {
          onGridUpdate(x, y, false);
        }
      }
      onDotClick(x, y);
    }
  };

  const getDirectionArrows = () => {
    const arrows: { x: number, y: number, direction: string }[] = [];

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

  const getArrowSymbol = (direction?: string) => {
    switch (direction) {
      case 'up': return '⬆';
      case 'down': return '⬇';
      case 'left': return '⬅';
      case 'right': return '➡';
      case 'up-left': return '↖';
      case 'up-right': return '↗';
      case 'down-left': return '↙';
      case 'down-right': return '↘';
      default: return '';
    }
  };

  // Function to check if a cell is part of shape preview
  const isInShapePreview = useCallback((x: number, y: number): boolean => {
    if (!shapePreview || !shapePreview.shape) return false; // Add null check for shape

    const { start, current, shape } = shapePreview;
    const minX = Math.min(start.x, current.x);
    const maxX = Math.max(start.x, current.x);
    const minY = Math.min(start.y, current.y);
    const maxY = Math.max(start.y, current.y);

    switch (shape) {
      case 'line':
        // Check if point is on the line using Bresenham's algorithm
        return isPointOnLine(x, y, start, current);
      
      case 'rectangle':
        // Check if point is on rectangle border
        return (x === minX || x === maxX) && y >= minY && y <= maxY ||
               (y === minY || y === maxY) && x >= minX && x <= maxX;
      
      case 'triangle':
        // Check if point is on triangle edges
        const midX = Math.floor((start.x + current.x) / 2);
        const topY = minY;
        const bottomY = maxY;
        
        return isPointOnLine(x, y, { x: midX, y: topY }, { x: minX, y: bottomY }) ||
               isPointOnLine(x, y, { x: midX, y: topY }, { x: maxX, y: bottomY }) ||
               isPointOnLine(x, y, { x: minX, y: bottomY }, { x: maxX, y: bottomY });
      
      case 'pixel':
        // Check if point is inside rectangle
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
      
      default:
        return false;
    }
  }, [shapePreview]);

  // Helper function to check if a point is on a line
  const isPointOnLine = (
    x: number, 
    y: number, 
    start: { x: number; y: number }, 
    end: { x: number; y: number }
  ): boolean => {
    // Bresenham's line algorithm to check if point is on the line
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

  if (!activeGrid || activeGrid.length === 0) {
    return (
      <div ref={containerRef} className="flex flex-col flex-[1_1_0%] min-h-80 relative w-full h-full overflow-hidden bg-gray-900 flex items-center justify-center">
        <div className="text-white">Initializing grid...</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col flex-[1_1_0%] min-h-80 relative w-full h-full overflow-hidden"
      data-whiteboard-container="true" 
    >
      <div
        ref={gridContainerRef}
        className="flex-1 relative z-10 overflow-hidden bg-gray-900"
        data-grid-container="true"  
        style={{
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'stretch',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            width: '100%',
            height: '100%',
            gap: `${gapSize}px`,
            background: 'transparent',
            flex: '1 1 auto',
          }}
        >
          {Array.from({ length: rows }).map((_, y) => (
            Array.from({ length: columns }).map((_, x) => {
              const isCursor = x === cursorX && y === cursorY;
              const isDrawn = activeGrid[y] && activeGrid[y][x];
              const isArrow = directionArrows.some(arrow => arrow.x === x && arrow.y === y);
              const arrowDirection = directionArrows.find(arrow => arrow.x === x && arrow.y === y)?.direction;
              const arrowSymbol = getArrowSymbol(arrowDirection);
              const isPreview = isInShapePreview(x, y) && !isDrawn; // Show preview only if not already drawn

              let dotClasses = 'transition-all duration-200 cursor-pointer flex items-center justify-center ';

              if (isDrawn) {
                dotClasses += ' bg-white border border-white';
              } else if (isPreview) {
                dotClasses += ' bg-blue-400/50 border border-blue-400 animate-pulse'; // Preview color
              } else {
                dotClasses += ' bg-gray-800/50 border border-gray-800';
              }

              if (isCursor) {
                const cursorConfig = {
                  0: { color: '#ef4444', shadow: '0 0 20px rgba(239,68,68,0.8)', symbol: 'X' },
                  1: { color: '#22c55e', shadow: '0 0 20px rgba(34,197,94,0.8)', symbol: 'O' },
                  2: { color: '#eab308', shadow: '0 0 20px rgba(234,179,8,0.8)', symbol: 'E' },
                }[penState]!;

                return (
                  <div
                    key={`${x}-${y}`}
                    className={`${dotClasses} animate-pulse z-20`}
                    style={{
                      width: '100%',
                      height: '100%',
                    }}
                    onClick={() => handleDotClick(x, y)}
                  >
                    <div
                      style={{
                        color: cursorConfig.color,
                        fontWeight: 'bold',
                        fontSize: `${dotSize * 0.5}px`,
                      }}
                    >
                      {cursorConfig.symbol}
                    </div>
                  </div>
                );
              } else if (isArrow) {
                return (
                  <div
                    key={`${x}-${y}`}
                    className={`${dotClasses} z-10`}
                    style={{
                      width: '100%',
                      height: '100%',
                    }}
                    onClick={() => handleDotClick(x, y)}
                  >
                    {!isDrawn ? (
                      <div
                        style={{
                          color: 'white',
                          fontWeight: 'bold',
                          fontSize: `${dotSize * 0.4}px`,
                        }}
                      >
                        {arrowSymbol}
                      </div>
                    ) : (
                      <div
                        style={{
                          color: 'black',
                          fontWeight: 'bold',
                          fontSize: `${dotSize * 0.4}px`,
                        }}
                      >
                        {arrowSymbol}
                      </div>
                    )}
                  </div>
                );
              } else {
                return (
                  <div
                    key={`${x}-${y}`}
                    className={dotClasses}
                    style={{
                      width: '100%',
                      height: '100%',
                    }}
                    onClick={() => handleDotClick(x, y)}
                  />
                );
              }
            })
          ))}
        </div>
      </div>
    </div>
  );
});

export default Whiteboard;