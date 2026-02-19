import type { BoardState } from "./board-state.js";
import { COLS, ROWS } from "./board-state-constants.js";

export const getLowestEmptyRow = (
  board: BoardState,
  col: number
): number | null => {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row * COLS + col] === " ") return row;
  }
  return null;
};
