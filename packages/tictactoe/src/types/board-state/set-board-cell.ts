import { PlayerMark } from "../player-mark/player-mark.js";
import type { BoardState } from "./board-state.js";

export const setBoardCell = ({
  board,
  index,
  mark
}: {
  readonly board: BoardState;
  readonly index: number;
  readonly mark: PlayerMark;
}): BoardState => {
  const next = board.slice(0, index) + mark + board.slice(index + 1);
  return next as BoardState;
};
