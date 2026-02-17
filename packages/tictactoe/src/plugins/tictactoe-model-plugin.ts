import { Database } from "@adobe/data/ecs";
import { BoardState } from "../types/board-state/board-state.js";
import { PlayerMark } from "../types/player-mark/player-mark.js";
import { PlayMoveArgs } from "../types/play-move-args/play-move-args.js";
import { Observe } from "@adobe/data/observe";

export const tictactoeModelPlugin = Database.Plugin.create({
  resources: {
    board: { default: BoardState.createInitialBoard() },
    firstPlayer: { default: "X" as PlayerMark }
  },
  computed: {
    currentPlayer: (db) =>
      Observe.withFilter(db.observe.resources.board, (board) => BoardState.currentPlayer(board, db.resources.firstPlayer)),
    moveCount: (db) => Observe.withFilter(db.observe.resources.board, BoardState.getMoveCount),
    status: (db) => Observe.withFilter(db.observe.resources.board, BoardState.deriveStatus),
    winningLine: (db) => Observe.withFilter(db.observe.resources.board, BoardState.getWinningLine),
    winner: (db) => Observe.withFilter(db.observe.resources.board, BoardState.getWinner),
    isGameOver: (db) => Observe.withFilter(db.observe.resources.board, BoardState.isGameOver),
  },
  transactions: {
    restartGame: (t) => {
      t.resources.firstPlayer = t.resources.firstPlayer === "X" ? "O" : "X";
      t.resources.board = BoardState.createInitialBoard();
    },
    playMove: (t, { index }: PlayMoveArgs) => {
      const validation = PlayMoveArgs.canPlayMove({
        board: t.resources.board,
        index
      });

      if (!validation.ok) {
        return;
      }

      const mark = BoardState.currentPlayer(t.resources.board, t.resources.firstPlayer);
      const nextBoard = BoardState.setBoardCell({
        board: t.resources.board,
        index,
        mark
      });

      t.resources.board = nextBoard;
    }
  }
});

export type TictactoeModelDatabase = Database.FromPlugin<typeof tictactoeModelPlugin>;
