export enum Operator {
  IF = 'IF',
  THEN = 'THEN',
  AND = 'AND',
  OR = 'OR',
  PLUS = 'PLUS',
  MINUS = 'MINUS',
  MULT = 'MULT', // Represents Multiply
  OVER = 'OVER', // Represents Division/Over
  START = 'START' // Center point
}

export interface CellData {
  id: string;
  row: number;
  col: number;
  operator: Operator | null;
  letter: string | null;
  isLocked?: boolean; // True if the tile was committed in a previous turn
  isBlank?: boolean; // True if the tile placed is actually a blank tile representing a letter
  turnPlaced?: number; // The turn index when this tile was locked
}

export interface LogicPhrase {
  id: string;
  word: string;
  operators: {
    op: Operator;
    indexInWord: number;
  }[];
  isValid: boolean;
}

export interface LogicChain {
  id: number | string;
  phrases: LogicPhrase[];
}

export interface P2PMessage {
  type: 'INIT_GAME' | 'TURN_COMMIT';
  payload: {
    grid: CellData[][];
    tileBag: string[];
    playerHand: string[]; // Hand of the sender
    opponentHand: string[]; // Hand of the receiver (sender's perspective)
    playerScore: number;
    opponentScore: number;
    turnCount: number;
  };
}