import { Database } from "@adobe/data/ecs";
import { Observe } from "@adobe/data/observe";
import { AgenticService } from "@adobe/data/service";
import { BoardState } from "../types/board-state/board-state.js";
import { PlayerMark } from "../types/player-mark/player-mark.js";
import { connect4ModelPlugin } from "./connect4-model-plugin.js";

const agentMark: PlayerMark = "R";
const opponentMark: PlayerMark = "Y";

export const agentPlugin = Database.Plugin.create({
  extends: connect4ModelPlugin,
  services: {
    agent: (db): AgenticService => {
      const board = db.observe.resources.board;
      const gameOver = Observe.withMap(board, BoardState.isGameOver);
      const winner = Observe.withFilter(board, BoardState.getWinner);
      const currentPlayer = Observe.withFilter(
        board,
        (nextBoard) =>
          BoardState.currentPlayer(nextBoard, db.resources.firstPlayer)
      );

      return AgenticService.create({
        description: `Lets an agent play Connect 4 (red) against a human (yellow). Board is 6 rows × 7 columns, row-major (42 chars). Drop a piece in a column (0–6); pieces fall by gravity. When the game is over (someone has 4 in a row or the board is full), the agent sees gameOver and winner (Y or R) and can call resetGame to start over.`,
        interface: {
          yourMark: PlayerMark.schema,
          opponentMark: PlayerMark.schema,
          board: BoardState.schema,
          currentPlayer: PlayerMark.schema,
          gameOver: {
            description: "True when the game has ended (winner or draw)",
            type: "boolean",
          },
          winner: PlayerMark.schema,
          resetGame: {
            description: "Reset the game (call when game is over or to start over)",
          },
          playMove: {
            description: "Drop a red piece in the given column (0 = left, 6 = right). Piece falls to the lowest empty row in that column.",
            input: { type: "integer", minimum: 0, maximum: 6 },
          },
        },
        implementation: {
          yourMark: Observe.fromConstant(agentMark),
          opponentMark: Observe.fromConstant(opponentMark),
          board,
          currentPlayer,
          gameOver,
          winner: winner as Observe<PlayerMark>,
          resetGame: async () => {
            db.transactions.resetGame();
          },
          playMove: async (col: number) => {
            db.transactions.playMove({ col });
          },
        },
        conditional: {
          currentPlayer: Observe.withMap(gameOver, (over) => !over),
          winner: Observe.withMap(board, (b) => BoardState.getWinner(b) != null),
          resetGame: gameOver,
          playMove: Observe.withFilter(
            Observe.fromProperties({ gameOver, currentPlayer }),
            ({ gameOver: over, currentPlayer: cur }) =>
              !over && cur === agentMark
          ),
        },
      });
    },
  },
});
