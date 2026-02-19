import { BoardState } from "../board-state/board-state.js";
import type { MoveRejectReason } from "../move-reject-reason.js";

export interface CanPlayInColumnArgs {
  readonly board: BoardState;
  readonly col: number;
}

export type CanPlayInColumnResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: MoveRejectReason };

export const canPlayInColumn = ({
  board,
  col,
}: CanPlayInColumnArgs): CanPlayInColumnResult => {
  if (!Number.isInteger(col) || col < 0 || col > 6) {
    return { ok: false, reason: "col_out_of_bounds" };
  }
  if (BoardState.getLowestEmptyRow(board, col) === null) {
    return { ok: false, reason: "column_full" };
  }
  return { ok: true };
};
