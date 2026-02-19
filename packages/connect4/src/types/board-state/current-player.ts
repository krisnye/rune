import type { BoardState } from "./board-state.js";
import type { PlayerMark } from "../player-mark/player-mark.js";

export const currentPlayer = (
  board: BoardState,
  firstPlayer: PlayerMark
): PlayerMark => {
  const yCount = [...board].filter((c) => c === "Y").length;
  const rCount = [...board].filter((c) => c === "R").length;
  return yCount <= rCount ? firstPlayer : (firstPlayer === "Y" ? "R" : "Y");
};
