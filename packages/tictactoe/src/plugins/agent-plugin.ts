
import { Database } from "@adobe/data/ecs";
import { PlayerMark } from "../types/player-mark/player-mark.js";
import { Observe } from "@adobe/data/observe";
import { tictactoePlugin } from "./tictactoe-plugin.js";
import { DynamicService } from "@adobe/data/service";
import { BoardState } from "../types/board-state/board-state.js";

const agentMark: PlayerMark = "O";
const opponentMark: PlayerMark = "X";

export const agentPlugin = Database.Plugin.create({
    extends: tictactoePlugin,
    services: {
        agent: db => {
            const board = db.observe.resources.board;
            const isGameOver = Observe.withFilter(board, BoardState.isGameOver);
            const currentPlayer = Observe.withFilter(
                board,
                (nextBoard) => BoardState.currentPlayer(nextBoard, db.resources.firstPlayer)
            );

            return DynamicService.create({
            states: {
                yourMark: DynamicService.state({
                    schema: PlayerMark.schema,
                    value: Observe.fromConstant(agentMark),
                }),
                opponentMark: DynamicService.state({
                    schema: PlayerMark.schema,
                    value: Observe.fromConstant(opponentMark),
                }),
                board: DynamicService.state({
                    schema: BoardState.schema,
                    value: board,
                }),
                currentPlayer: DynamicService.state({
                    enabled: Observe.withMap(isGameOver, (gameOver) => !gameOver),
                    schema: PlayerMark.schema,
                    value: currentPlayer
                })
            },
            actions: {
                resetGame: DynamicService.action({
                    description: "Reset the game after completion",
                    enabled: isGameOver,
                    schema: false,
                    execute: async () => {
                        db.transactions.restartGame();
                    }
                }),
                playMove: DynamicService.action({
                    description: "Play an O move on the board",
                    enabled: Observe.withFilter(
                        Observe.fromProperties({
                            isGameOver,
                            currentPlayer,
                        }),
                        ({isGameOver, currentPlayer}) => !isGameOver && currentPlayer === agentMark
                    ),
                    schema: { type: "integer", minimum: 0, maximum: 8 },
                    execute: async (index: number) => {
                        db.transactions.playMove({ index });
                    }
                })
            }
            });
        }
    }
});
