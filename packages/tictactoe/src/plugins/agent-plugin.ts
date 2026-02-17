import { Database } from "@adobe/data/ecs";
import { PlayerMark } from "../types/player-mark/player-mark.js";
import { Observe } from "@adobe/data/observe";
import { AgenticService } from "@adobe/data/service";
import { tictactoeModelPlugin } from "./tictactoe-model-plugin.js";
import { BoardState } from "../types/board-state/board-state.js";

const agentMark: PlayerMark = "O";
const opponentMark: PlayerMark = "X";

export const agentPlugin = Database.Plugin.create({
  extends: tictactoeModelPlugin,
  services: {
    agent: (db): AgenticService => {
      const board = db.observe.resources.board;
      const isGameOver = Observe.withFilter(board, BoardState.isGameOver);
      const currentPlayer = Observe.withFilter(
        board,
        (nextBoard) => BoardState.currentPlayer(nextBoard, db.resources.firstPlayer)
      );

      return AgenticService.create({
        description: `This lets an agent play a tic tac toe against a human player.`,
        interface: {
          yourMark: PlayerMark.schema,
          opponentMark: PlayerMark.schema,
          board: BoardState.schema,
          currentPlayer: PlayerMark.schema,
          resetGame: { description: "Reset the game after completion" },
          playMove: {
            description: "Play an O move on the board",
            input: { type: "integer", minimum: 0, maximum: 8 }
          }
        },
        implementation: {
          yourMark: Observe.fromConstant(agentMark),
          opponentMark: Observe.fromConstant(opponentMark),
          board,
          currentPlayer,
          resetGame: async () => {
            db.transactions.restartGame();
          },
          playMove: async (index: number) => {
            db.transactions.playMove({ index });
          }
        },
        conditional: {
          currentPlayer: Observe.withMap(isGameOver, (gameOver) => !gameOver),
          resetGame: isGameOver,
          playMove: Observe.withFilter(
            Observe.fromProperties({ isGameOver, currentPlayer }),
            ({ isGameOver, currentPlayer }) => !isGameOver && currentPlayer === agentMark
          )
        }
      });
    }
  }
});
