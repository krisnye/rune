import type { BoardState } from "./board-state.js";
import { PlayerMark } from "../player-mark/player-mark.js";

export const currentPlayer = (board: BoardState, firstPlayer: PlayerMark = "X"): PlayerMark => {
  const xCount = [...board].filter((cell) => cell === "X").length;
  const oCount = [...board].filter((cell) => cell === "O").length;
  if (firstPlayer === "X") {
    return xCount <= oCount ? "X" : "O";
  }
  return oCount <= xCount ? "O" : "X";
};
