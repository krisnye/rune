import type { WinningLine } from "../winning-line.js";
import type { BoardState } from "./board-state.js";

const winningLines: readonly WinningLine[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

export const getWinningLine = (board: BoardState): WinningLine | null => {
  for (const line of winningLines) {
    const [a, b, c] = line;
    const first = board[a];
    if (first !== " " && first === board[b] && first === board[c]) {
      return line;
    }
  }
  return null;
};
