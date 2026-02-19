import type { BoardState } from "./board-state.js";
import { getLowestEmptyRow } from "./get-lowest-empty-row.js";

export const isColumnFull = (
  board: BoardState,
  col: number
): boolean => getLowestEmptyRow(board, col) === null;
