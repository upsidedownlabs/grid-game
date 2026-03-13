import React from 'react';
import { MoveHorizontal, MoveVertical, MoveDiagonal, MoveDiagonal2, PencilOff, Pencil, Eraser } from 'lucide-react';

interface HeaderProps {
  connected: boolean;
  currentMode: number;
  penState: number;
  onConnect: () => void;
  onDisconnect: () => void;
  onUndo: () => void;
  showGame: () => void;
  onRedo: () => void;
  onClear: () => void;
  getModeName: (mode?: number) => string;
  getModeSymbol: () => string;
  getModeClass: () => string;
  getPenStateName: () => string;
}

const Header: React.FC<HeaderProps> = ({
  connected,
  currentMode,
  penState,
  onConnect,
  onDisconnect,
  onUndo,
  onRedo,
  onClear,
  getModeName,
  showGame,
}) => {
  return (
    <div className="bg-black/60 backdrop-blur-lg border-b border-white/10 p-2 md:p-4 shrink-0 h-16">
      <div className="h-full max-w-[100vw] mx-auto flex justify-between items-center gap-1 sm:gap-3">
        {/* Left: Title and Status */}
        <div className="flex items-center gap-1 sm:gap-3 min-w-0 shrink">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold bg-blue-500 bg-clip-text text-transparent whitespace-nowrap">
            NeuroArt.<span className="text-blue-400">Whiteboard</span>
          </h1>

          <div className="hidden sm:flex items-center gap-1 md:gap-3">
            {/* Pen State Display */}
            <div className={`px-2 md:px-3 py-1 rounded-lg text-xs md:text-sm ${
              penState === 0 
                ? 'bg-gray-800 text-gray-400 border border-gray-700'
                : penState === 1 
                  ? 'bg-green-800/30 text-green-300 border border-green-600'
                  : 'bg-yellow-800/30 text-yellow-300 border border-yellow-600'
            }`}>
              {penState === 0 ? (
                <span className="flex items-center gap-1">
                  <PencilOff size={14} /> 
                  <span className="hidden lg:inline">Disabled</span>
                </span>
              ) : penState === 1 ? (
                <span className="flex items-center gap-1">
                  <Pencil size={14} /> 
                  <span className="hidden lg:inline">Drawing</span>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Eraser size={14} /> 
                  <span className="hidden lg:inline">Erasing</span>
                </span>
              )}
            </div>

            {/* Mode Display */}
            <div className={`px-2 md:px-3 py-1 rounded-lg flex items-center gap-1 md:gap-2 text-xs md:text-sm ${
              currentMode === 0
                ? 'bg-blue-800/30 text-blue-300 border border-blue-600'
                : currentMode === 1
                  ? 'bg-green-800/30 text-green-300 border border-green-600'
                  : currentMode === 2
                    ? 'bg-purple-800/30 text-purple-300 border border-purple-600'
                    : 'bg-pink-800/30 text-pink-300 border border-pink-600'
            }`}>
              <span className="font-bold flex items-center">
                {currentMode === 0 ? (
                  <MoveHorizontal size={14} />
                ) : currentMode === 1 ? (
                  <MoveVertical size={14} />
                ) : currentMode === 2 ? (
                  <MoveDiagonal2 size={14} />
                ) : (
                  <MoveDiagonal size={14} />
                )}
              </span>
              <span className="hidden lg:inline">{getModeName()}</span>
            </div>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-none shrink-0">
          {/* BLE Controls */}
          <div className="flex gap-1 sm:gap-2">
            {!connected ? (
              <button
                onClick={onConnect}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 bg-[#0077b6] text-white rounded-lg hover:bg-[#0096c7] transition-all text-xs sm:text-sm whitespace-nowrap"
              >
                <span className="text-sm">🔗</span>
                <span className="hidden xs:inline sm:inline font-semibold">Connect NPG Lite device</span>
              </button>
            ) : (
              <button
                onClick={onDisconnect}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all shadow-md hover:shadow-lg text-xs sm:text-sm whitespace-nowrap"
              >
                <span className="text-sm">🔌</span>
                <span className="hidden xs:inline sm:inline font-semibold">Disconnect</span>
              </button>
            )}
          </div>

          {/* Drawing Controls */}
          <div className="flex gap-1 sm:gap-2">
            <button
              onClick={onUndo}
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all shadow-md hover:shadow-lg text-xs sm:text-sm whitespace-nowrap"
              title="Undo (Ctrl+Z)"
            >
              <span className="text-sm">↶</span>
              <span className="hidden sm:inline font-semibold">Undo</span>
            </button>

            <button
              onClick={onRedo}
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all shadow-md hover:shadow-lg text-xs sm:text-sm whitespace-nowrap"
              title="Redo (Ctrl+Y)"
            >
              <span className="text-sm">↷</span>
              <span className="hidden sm:inline font-semibold">Redo</span>
            </button>

            <button
              onClick={onClear}
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all shadow-md hover:shadow-lg text-xs sm:text-sm whitespace-nowrap"
              title="Clear Board"
            >
              <span className="text-sm">🗑️</span>
              <span className="hidden sm:inline font-semibold">Clear</span>
            </button>

            {/* Floating Game Button */}
            <button
              onClick={showGame}
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 border border-blue-800 text-white rounded-lg hover:bg-blue-600 transition-all shadow-md hover:shadow-lg text-xs sm:text-sm whitespace-nowrap"
            >
              <span className="text-base sm:text-lg md:text-xl">🎮</span>
              <span className="hidden md:inline font-semibold">Practice Game</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;