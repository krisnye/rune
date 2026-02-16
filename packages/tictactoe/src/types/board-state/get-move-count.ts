import type { BoardState } from "./board-state.js";

export const getMoveCount = (board: BoardState): number =>
  [...board].filter((cell) => cell === "X" || cell === "O").length;
