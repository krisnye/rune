import type { BoardCell } from "../board-cell.js";
import type { BoardState } from "./board-state.js";
import { getLowestEmptyRow } from "./get-lowest-empty-row.js";
import { COLS } from "./board-state-constants.js";

export const placePiece = (
  board: BoardState,
  col: number,
  piece: BoardCell
): BoardState => {
  const row = getLowestEmptyRow(board, col);
  if (row === null) return board;
  const index = row * COLS + col;
  return (board.slice(0, index) + piece + board.slice(index + 1)) as BoardState;
};
