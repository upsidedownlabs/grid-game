'use client';

import { useEffect, useRef, useState } from 'react';
import { MenuItem } from '../types';

interface MenuPopupProps {
  active: boolean;
  selection: number;
  items: MenuItem[];
  level: number;
  levelName: string;
  cursorX: number;
  cursorY: number;
  cursorPixelX: number;
  cursorPixelY: number;
  gridDimensions: { columns: number; rows: number };
  onClose: () => void;
  onSelect: (index: number) => void;
  cellSize?: number;
}

const MenuPopup: React.FC<MenuPopupProps> = ({
  active,
  selection,
  items,
  level,
  levelName,
  cursorX,
  cursorY,
  cursorPixelX,
  cursorPixelY,
  gridDimensions,
  onClose,
  onSelect,
  cellSize = 40,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, arrowLeft: 12 });
  const [isPositionCalculated, setIsPositionCalculated] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (active) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [active, onClose]);

  // Calculate position whenever cursor pixel position changes
  useEffect(() => {
    if (!active) {
      setIsPositionCalculated(false);
      return;
    }

    const calculatePosition = () => {
      // Calculate menu dimensions
      const itemHeight = 38;
      const headerHeight = 32;
      const footerHeight = 28;
      const menuWidth = 240;
      const menuHeight = items.length * itemHeight + headerHeight + footerHeight;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const padding = 15;

      // Get cursor position - use pixel coordinates if available, otherwise calculate from grid
      let cursorXpx = cursorPixelX;
      let cursorYpx = cursorPixelY;

      // If pixel coordinates are not available, calculate from grid
      if (cursorXpx === 0 && cursorYpx === 0) {
        const gridContainer = document.querySelector('[data-grid-container="true"]');
        if (gridContainer && gridDimensions.columns > 0 && gridDimensions.rows > 0) {
          const gridRect = gridContainer.getBoundingClientRect();
          const cellWidth = gridRect.width / gridDimensions.columns;
          const cellHeight = gridRect.height / gridDimensions.rows;
          
          cursorXpx = gridRect.left + (cursorX * cellWidth) + (cellWidth / 2);
          cursorYpx = gridRect.top + (cursorY * cellHeight) + (cellHeight / 2);
        } else {
          // Fallback to center of screen if we can't calculate
          cursorXpx = viewportWidth / 2;
          cursorYpx = viewportHeight / 2;
        }
      }

      // Calculate available space
      const spaceRight = viewportWidth - cursorXpx - padding;
      const spaceLeft = cursorXpx - padding;

      let left, top, arrowLeft;

      // Horizontal positioning - prefer placing menu to the right
      if (spaceRight >= menuWidth) {
        // Place on right side
        left = cursorXpx + padding;
        arrowLeft = 12; // Arrow on left side
      } else if (spaceLeft >= menuWidth) {
        // Place on left side
        left = cursorXpx - menuWidth - padding;
        arrowLeft = menuWidth - 20; // Arrow on right side
      } else {
        // Not enough space on either side, center horizontally
        left = Math.max(padding, Math.min(cursorXpx - menuWidth/2, viewportWidth - menuWidth - padding));
        arrowLeft = cursorXpx - left; // Arrow points to cursor
      }

      // Vertical positioning - try to center menu vertically near cursor
      let idealTop = cursorYpx - menuHeight / 2;
      
      // Ensure menu stays within viewport vertically
      if (idealTop < padding) {
        top = padding;
      } else if (idealTop + menuHeight > viewportHeight - padding) {
        top = viewportHeight - menuHeight - padding;
      } else {
        top = idealTop;
      }

      // Ensure menu stays within viewport horizontally
      left = Math.max(padding, Math.min(left, viewportWidth - menuWidth - padding));

      setPosition({ left, top, arrowLeft });
      setIsPositionCalculated(true);
    };

    // Calculate position immediately
    calculatePosition();

    // Also calculate after a small delay to ensure DOM is ready
    const timeoutId = setTimeout(calculatePosition, 50);

    // Add resize listener
    window.addEventListener('resize', calculatePosition);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', calculatePosition);
    };
  }, [active, cursorPixelX, cursorPixelY, cursorX, cursorY, items.length, gridDimensions]);

  // Show selection timer indicator
  useEffect(() => {
    if (active && selection !== undefined) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        // Timer complete - visual feedback only
      }, 2000);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [active, selection]);

  // Don't render if not active OR position hasn't been calculated yet
  if (!active) return null;

  // Calculate menu dimensions
  const itemHeight = 38;
  const headerHeight = 32;
  const footerHeight = 28;
  const totalMenuHeight = items.length * itemHeight + headerHeight + footerHeight;
  const menuWidth = 240;

  // Colors for different menu levels
  const levelColors = [
    'from-blue-400/10 to-purple-400/10 border-blue-200/30',
    'from-green-400/10 to-teal-400/10 border-green-200/30',
    'from-orange-400/10 to-red-400/10 border-orange-200/30',
  ];

  const levelColor = levelColors[level % levelColors.length];
  
  // Determine arrow direction based on position
  const isArrowOnRight = position.arrowLeft > menuWidth - 30;

  return (
    <div
      ref={popupRef}
      className="fixed z-[100]"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
        // Add a fade-in effect when position is calculated
        opacity: isPositionCalculated ? 1 : 0,
        transition: 'opacity 0.15s ease-in-out',
      }}
    >
      <div 
        className={`
          relative
          bg-white/95 backdrop-blur-md
          border rounded-lg shadow-xl
          overflow-hidden
          transition-all duration-150
          border-gray-200
          ${levelColor}
        `}
        style={{ 
          width: `${menuWidth}px`,
          height: `${totalMenuHeight}px`
        }}
      >
        {/* Connection line to cursor */}
        <div
          className="absolute w-0.5 h-6 bg-gradient-to-t from-gray-400/30 to-transparent"
          style={{
            left: `${position.arrowLeft}px`,
            top: '-20px',
          }}
        />

        {/* Header */}
        <div 
          className={`
            px-3
            border-b border-gray-100
            bg-gradient-to-r ${levelColor}
            flex items-center justify-between
          `}
          style={{ height: `${headerHeight}px` }}
        >
          <h3 className="text-xs font-medium text-gray-600 flex items-center gap-1">
            <span className="text-[10px] px-1.5 py-0.5 bg-white/50 rounded">
              Menu
            </span>
            {levelName}
          </h3>
          <div className="text-[10px] text-gray-400 bg-white/30 px-1.5 py-0.5 rounded">
            {level + 1}/3
          </div>
        </div>

        {/* Menu Items - NO SCROLLBAR */}
        <div 
          className="py-1"
          style={{ 
            height: `${items.length * itemHeight}px`,
            overflow: 'hidden'
          }}
        >
          {items.map((item, index) => {
            const isSelected = index === selection;
            const isCancel = item.id === 'cancel-shape';

            return (
              <button
                key={item.id}
                onClick={() => onSelect(index)}
                className={`
                  w-full
                  flex items-center gap-2
                  px-3
                  transition-all duration-150
                  text-left
                  relative
                  group
                  ${isSelected ? (isCancel ? 'bg-red-50' : 'bg-blue-50') : 'hover:bg-gray-50'}
                `}
                style={{ height: `${itemHeight}px` }}
              >
                {/* Selection indicator */}
                {isSelected && (
                  <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${isCancel ? 'bg-red-500' : 'bg-blue-500'} animate-pulse`} />
                )}

                {/* Icon */}
                <span className={`
                  text-base w-5 text-center rounded
                  ${isSelected ? (isCancel ? 'text-red-600' : 'text-blue-600') : (isCancel ? 'text-red-400' : 'text-gray-500')}
                `}>
                  {item.icon}
                </span>

                {/* Name */}
                <span className={`
                  flex-1 text-xs font-medium truncate
                  ${isSelected ? (isCancel ? 'text-red-700' : 'text-blue-700') : (isCancel ? 'text-red-600' : 'text-gray-600')}
                `}>
                  {item.name}
                </span>

                {/* Selection timer indicator */}
                {isSelected && (
                  <div className="flex items-center gap-1 ml-auto">
                    <div className={`w-1 h-1 rounded-full ${isCancel ? 'bg-red-400' : 'bg-blue-400'} animate-pulse`} />
                    <span className={`text-[8px] ${isCancel ? 'text-red-400' : 'text-blue-400'}`}>2s</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>



      </div>
    </div>
  );
};

export default MenuPopup;