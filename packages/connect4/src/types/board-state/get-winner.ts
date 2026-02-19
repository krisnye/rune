import type { BoardState } from "./board-state.js";
import type { PlayerMark } from "../player-mark/player-mark.js";
import { COLS, ROWS } from "./board-state-constants.js";

const hasFourInLine = (
  board: BoardState,
  mark: string,
  ...indices: [number, number, number, number]
): boolean =>
  indices.every((i) => board[i] === mark);

export const getWinner = (board: BoardState): PlayerMark | null => {
  for (const mark of ["Y", "R"] as const) {
    // Horizontal: each row, windows of 4
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col <= COLS - 4; col++) {
        if (
          hasFourInLine(
            board,
            mark,
            row * COLS + col,
            row * COLS + col + 1,
            row * COLS + col + 2,
            row * COLS + col + 3
          )
        )
          return mark;
      }
    }
    // Vertical: each column, windows of 4
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row <= ROWS - 4; row++) {
        if (
          hasFourInLine(
            board,
            mark,
            row * COLS + col,
            (row + 1) * COLS + col,
            (row + 2) * COLS + col,
            (row + 3) * COLS + col
          )
        )
          return mark;
      }
    }
    // Diagonal \ (down-right)
    for (let row = 0; row <= ROWS - 4; row++) {
      for (let col = 0; col <= COLS - 4; col++) {
        if (
          hasFourInLine(
            board,
            mark,
            row * COLS + col,
            (row + 1) * COLS + col + 1,
            (row + 2) * COLS + col + 2,
            (row + 3) * COLS + col + 3
          )
        )
          return mark;
      }
    }
    // Diagonal / (down-left)
    for (let row = 3; row < ROWS; row++) {
      for (let col = 0; col <= COLS - 4; col++) {
        if (
          hasFourInLine(
            board,
            mark,
            row * COLS + col,
            (row - 1) * COLS + col + 1,
            (row - 2) * COLS + col + 2,
            (row - 3) * COLS + col + 3
          )
        )
          return mark;
      }
    }
  }
  return null;
};
