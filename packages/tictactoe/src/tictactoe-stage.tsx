import { useObservableValues } from "@adobe/data-react";
import { useDatabase } from "./hooks/use-database.js";
import { BoardState } from "./types/board-state/board-state.js";

const cellSize = 110;
const boardOriginX = 155;
const boardOriginY = 70;

interface StageValues {
  readonly board: string;
}

export const TicTacToeStage = () => {
  const db = useDatabase() as unknown as {
    observe: {
      resources: {
        board: unknown;
      };
    };
    transactions: unknown;
  };
  const values = useObservableValues(
    () => ({
      board: db.observe.resources.board as any
    }),
    []
  ) as StageValues | undefined;

  if (!values || typeof values.board !== "string") {
    return null;
  }

  const transactions = db.transactions as unknown as {
    playMove: (args: { readonly index: number }) => void;
  };
  const winningLine = BoardState.getWinningLine(values.board as any);
  const winningSet = new Set(winningLine ?? []);
  const status = BoardState.deriveStatus(values.board as any);

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
              onClick={() => transactions.playMove({ index })}
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
