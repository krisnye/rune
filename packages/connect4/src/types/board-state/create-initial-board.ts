import type { BoardState } from "./board-state.js";
import { COLS, ROWS } from "./board-state-constants.js";

export const createInitialBoard = (): BoardState =>
  " ".repeat(ROWS * COLS) as BoardState;
