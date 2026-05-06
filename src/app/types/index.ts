// types/index.ts

export interface BoardState {
  board: boolean[][];
  cursorX: number;
  cursorY: number;
  currentMode: DrawingMode;
  penState: PenState;
  menuActive: boolean;
  menuLevel: number; 
  menuSelection: number;
  timestamp: number;
}


export interface GridCell {
  x: number;
  y: number;
  drawn: boolean;
}
// types.ts
export interface MenuItem {
  id: string;
  name: string;
  icon: string;
  action: () => void;
}

export type DrawingMode = 0 | 1 | 2 | 3;
export type PenState = 0 | 1 | 2;


export interface MenuLevel {
  id: number;
  name: string;
  items: Array<{
    id: string;
    name: string;
    icon: string;
    action: string;
  }>;
}