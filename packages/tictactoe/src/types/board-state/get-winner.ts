import { PlayerMark } from "../player-mark/player-mark.js";
import { getWinningLine } from "./get-winning-line.js";
import type { BoardState } from "./board-state.js";

export const getWinner = (board: BoardState): PlayerMark | null => {
  const winningLine = getWinningLine(board);
  return winningLine === null ? null : (board[winningLine[0]] as PlayerMark);
};
