import { CellData, Operator } from '../types';

export const BOARD_SIZE = 11; // 11x11 Grid

export const generateBoard = (): CellData[][] => {
  const grid: CellData[][] = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    const row: CellData[] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      let op: Operator | null = null;
      const id = `${r}-${c}`;

      // 1. Corners: MULTIPLY
      if ((r === 0 || r === BOARD_SIZE - 1) && (c === 0 || c === BOARD_SIZE - 1)) {
        op = Operator.MULT;
      }
      // 2. Start Position (5, 5) - Center
      else if (r === 5 && c === 5) {
        op = Operator.START;
      }
      // 3. Specific Operator Swaps (Overrides)
      else if (r === 2 && c === 8) {
        op = Operator.OVER; // Swapped from IF
      }
      else if (r === 4 && c === 4) {
        op = Operator.IF; // Swapped from OVER
      }
      else if (r === 5 && c === 0) {
        op = Operator.OVER; // Swapped from OR
      }
      else if (r === 6 && c === 6) {
        op = Operator.OR; // Swapped from OVER
      }
      else if (r === 5 && c === 10) {
        op = Operator.IF; // Changed from OR
      }
      else if (r === 8 && c === 2) {
        op = Operator.OR; // Changed from IF
      }
      // 4. Inner Ring (Conditionals)
      else if ((r === 2 || r === 8) && (c === 2 || c === 8)) {
        op = Operator.IF;
      }
      else if ((r === 2 || r === 8) && c === 5) {
        op = Operator.THEN;
      }
      else if ((c === 2 || c === 8) && r === 5) {
        op = Operator.THEN;
      }
      // 5. Diagonals (Conjunctions & Division)
      else if (Math.abs(r - 5) === Math.abs(c - 5) && r !== 5 && r !== 0 && r !== 10) {
        if (Math.abs(r - 5) === 1) {
          op = Operator.OVER;
        } else {
          op = Operator.AND;
        }
      }
      // 6. Crosses (Modifiers)
      else if ((r === 1 || r === 9) && c === 5) {
        op = Operator.PLUS;
      }
      else if ((c === 1 || c === 9) && r === 5) {
        op = Operator.MINUS;
      }
      // 7. Edges (OR)
      else if ((r === 0 || r === 10) && c === 5) {
        op = Operator.OR;
      }
       else if ((c === 0 || c === 10) && r === 5) {
        op = Operator.OR;
      }

      row.push({
        id,
        row: r,
        col: c,
        operator: op,
        letter: null,
      });
    }
    grid.push(row);
  }

  return grid;
};