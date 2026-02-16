import type { BoardState } from "./board-state.js";

export const isBoardFull = (board: BoardState): boolean => !board.includes(" ");
