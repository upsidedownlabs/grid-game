// components/MenuPopup.tsx
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
    if (!active) return;

    const calculatePosition = () => {
      if (!popupRef.current) return;

      // Calculate menu dimensions
      const itemHeight = 38;
      const headerHeight = 32;
      const footerHeight = 28;
      const menuWidth = 240;
      const menuHeight = items.length * itemHeight + headerHeight + footerHeight;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const padding = 15;

      // Use cursor pixel position from props
      const cursorXpx = cursorPixelX;
      const cursorYpx = cursorPixelY;

      // If cursor pixel position is invalid (0,0), try to calculate it
      if (cursorXpx === 0 && cursorYpx === 0) {
        // Fallback: try to get grid container and calculate
        const gridContainer = document.querySelector('[data-grid-container="true"]');
        if (gridContainer && gridDimensions.columns > 0 && gridDimensions.rows > 0) {
          const gridRect = gridContainer.getBoundingClientRect();
          const cellWidth = gridRect.width / gridDimensions.columns;
          const cellHeight = gridRect.height / gridDimensions.rows;
          
          // Use cursorX and cursorY from props to calculate position
          const calculatedX = gridRect.left + (cursorX * cellWidth) + (cellWidth / 2);
          const calculatedY = gridRect.top + (cursorY * cellHeight) + (cellHeight / 2);
          
          // Use calculated values
          calculatePositionWithValues(calculatedX, calculatedY, menuWidth, menuHeight, viewportWidth, viewportHeight, padding);
          return;
        }
      } else {
        // Use the provided cursor pixel position
        calculatePositionWithValues(cursorXpx, cursorYpx, menuWidth, menuHeight, viewportWidth, viewportHeight, padding);
      }
    };

    const calculatePositionWithValues = (
      cursorXpx: number,
      cursorYpx: number,
      menuWidth: number,
      menuHeight: number,
      viewportWidth: number,
      viewportHeight: number,
      padding: number
    ) => {
      // Calculate available space
      const spaceRight = viewportWidth - cursorXpx - padding;
      const spaceLeft = cursorXpx - padding;
      const spaceBottom = viewportHeight - cursorYpx - padding;
      const spaceTop = cursorYpx - padding;

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
    };

    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(calculatePosition, 50);
    return () => clearTimeout(timeoutId);
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

        {/* Footer */}
        <div 
          className="px-3 border-t border-gray-100 bg-gray-50/50"
          style={{ height: `${footerHeight}px` }}
        >
          <div className="flex h-full items-center justify-between text-[9px] text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-gray-200 rounded-sm flex items-center justify-center text-gray-600">M</span>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-gray-200 rounded-sm flex items-center justify-center text-gray-600">S</span>
              switch
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-gray-200 rounded-sm flex items-center justify-center text-gray-600">2s</span>
              select
            </span>
          </div>
        </div>

        {/* Arrow pointing to cursor */}
        <div
          className={`
            absolute w-2 h-2 bg-white border-t border-l border-gray-200 rotate-45
            ${isArrowOnRight ? '-right-1' : '-left-1'}
            top-1/2 -translate-y-1/2
          `}
          style={{
            borderColor: isArrowOnRight ? '#e5e7eb transparent transparent #e5e7eb' : '#e5e7eb #e5e7eb transparent transparent',
          }}
        />
      </div>
    </div>
  );
};

export default MenuPopup;