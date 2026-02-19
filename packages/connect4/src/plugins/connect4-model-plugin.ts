import { Database } from "@adobe/data/ecs";
import { Observe } from "@adobe/data/observe";
import { BoardState } from "../types/board-state/board-state.js";
import { PlayerMark } from "../types/player-mark/player-mark.js";
import { PlayMoveArgs } from "../types/play-move-args/play-move-args.js";

export const connect4ModelPlugin = Database.Plugin.create({
  resources: {
    board: { default: BoardState.createInitialBoard() },
    firstPlayer: { default: "Y" as PlayerMark },
  },
  computed: {
    currentPlayer: (db) =>
      Observe.withFilter(db.observe.resources.board, (board) =>
        BoardState.currentPlayer(board, db.resources.firstPlayer)
      ),
    winner: (db) =>
      Observe.withFilter(db.observe.resources.board, BoardState.getWinner),
    gameOver: (db) =>
      Observe.withFilter(db.observe.resources.board, BoardState.isGameOver),
  },
  transactions: {
    resetGame: (t) => {
      t.resources.board = BoardState.createInitialBoard();
    },
    playMove: (t, { col }: PlayMoveArgs) => {
      const result = PlayMoveArgs.canPlayInColumn({
        board: t.resources.board,
        col,
      });
      if (!result.ok) return;
      const current = BoardState.currentPlayer(
        t.resources.board,
        t.resources.firstPlayer
      );
      t.resources.board = BoardState.placePiece(t.resources.board, col, current);
    },
  },
});

export type Connect4ModelDatabase = Database.FromPlugin<
  typeof connect4ModelPlugin
>;
