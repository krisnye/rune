import type { GameStatus } from "../game-status.js";
import type { BoardState } from "./board-state.js";
import { getWinningLine } from "./get-winning-line.js";
import { isBoardFull } from "./is-board-full.js";

export const deriveStatus = (board: BoardState): Extract<GameStatus, "in_progress" | "won" | "draw"> => {
  if (getWinningLine(board) !== null) {
    return "won";
  }
  return isBoardFull(board) ? "draw" : "in_progress";
};
