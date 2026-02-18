import { useObservableValues } from "@adobe/data-react";
import { useTicTacToeDatabase } from "../hooks/use-tictactoe-database.js";
import { BoardState } from "../types/board-state/board-state.js";

const cellSize = 110;
const boardOriginX = 155;
const boardOriginY = 70;

export const TicTacToeStage = () => {
  // every element first gets the common database service
  const db = useTicTacToeDatabase()
  // then they use whichever observable values they need
  // whenever these values change this hook will trigger a re-render.
  const values = useObservableValues(
    () => ({
      // pattern is name: Observe function
      board: db.observe.resources.board
    }),
    [] // dependencies, rarely needed. Only if you had a parameter used in the useObservableValues input.
  );

  if (!values) {
    return null;
  }

  const winningLine = BoardState.getWinningLine(values.board);
  const winningSet = new Set(winningLine ?? []);
  const status = BoardState.deriveStatus(values.board);

  return (
    <pixiContainer>
      {values.board.split("").map((cell: string, index: number) => {
        const col = index % 3;
        const row = Math.floor(index / 3);
        const x = boardOriginX + col * cellSize;
        const y = boardOriginY + row * cellSize;
        const isWinningCell = winningSet.has(index);
        const isPlayable = status === "in_progress" && cell === " ";

        return (
          <pixiContainer key={index}>
            <pixiGraphics
              x={x}
              y={y}
              eventMode={isPlayable ? "static" : "none"}
              cursor={isPlayable ? "pointer" : "default"}
              onClick={() => db.transactions.playMove({ index })}
              draw={(graphics) => {
                graphics.clear();
                graphics.rect(0, 0, cellSize - 4, cellSize - 4);
                graphics.fill(isWinningCell ? 0x2e7d32 : 0x1f2937);
                graphics.stroke({ width: 2, color: 0x6b7280 });

                if (cell === "X") {
                  graphics.moveTo(20, 20);
                  graphics.lineTo(cellSize - 24, cellSize - 24);
                  graphics.moveTo(cellSize - 24, 20);
                  graphics.lineTo(20, cellSize - 24);
                  graphics.stroke({ width: 8, color: 0xe5e7eb, cap: "round" });
                }

                if (cell === "O") {
                  graphics.circle((cellSize - 4) / 2, (cellSize - 4) / 2, 32);
                  graphics.stroke({ width: 8, color: 0xe5e7eb });
                }
              }}
            />
          </pixiContainer>
        );
      })}
    </pixiContainer>
  );
};
