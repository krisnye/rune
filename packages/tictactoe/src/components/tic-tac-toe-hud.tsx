import { useObservableValues } from "@adobe/data-react";
import { useTicTacToeDatabase } from "../hooks/use-tictactoe-database.js";
import { BoardState } from "../types/board-state/board-state.js";

interface HudValues {
  readonly board: string;
  readonly firstPlayer: "X" | "O";
}

export const TicTacToeHud = () => {
  const db = useTicTacToeDatabase() as unknown as {
    observe: {
      resources: {
        board: unknown;
        firstPlayer: unknown;
      };
    };
    transactions: unknown;
  };

  const values = useObservableValues(
    () => ({
      board: db.observe.resources.board as any,
      firstPlayer: db.observe.resources.firstPlayer as any
    }),
    []
  ) as HudValues | undefined;

  const transactions = db.transactions as unknown as {
    restartGame: () => void;
  };

  if (!values || typeof values.board !== "string") {
    return null;
  }

  const currentPlayer = BoardState.currentPlayer(values.board as any, values.firstPlayer);
  const status = BoardState.deriveStatus(values.board as any);
  const winner = BoardState.getWinner(values.board as any);

  const statusText =
    status === "won" && winner !== null ? `Winner: ${winner}` : status === "draw" ? "Draw" : `Current Player: ${currentPlayer}`;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
      <strong style={{ color: "#e5e7eb" }}>{statusText}</strong>
      <button onClick={() => transactions.restartGame()}>Restart</button>
    </div>
  );
};
