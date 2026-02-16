import { useObservableValues } from "@adobe/data-react";
import { useDatabase } from "./hooks/use-database.js";
import { BoardState } from "./types/board-state/board-state.js";
import { type RuneDevBridgeStatus } from "./rune-dev-bridge/create-browser-host.js";

interface HudValues {
  readonly board: string;
  readonly firstPlayer: "X" | "O";
}

export const TicTacToeHud = ({
  bridgeStatus
}: {
  readonly bridgeStatus?: RuneDevBridgeStatus;
}) => {
  const db = useDatabase() as unknown as {
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

  const bridgeLabel = !import.meta.env.DEV
    ? null
    : bridgeStatus?.hostAccepted
      ? "Bridge: Host Active"
      : bridgeStatus?.socketConnected
        ? "Bridge: Connected (standby)"
        : "Bridge: Disconnected";

  const bridgeColor = !import.meta.env.DEV
    ? "#6b7280"
    : bridgeStatus?.hostAccepted
      ? "#22c55e"
      : bridgeStatus?.socketConnected
        ? "#f59e0b"
        : "#ef4444";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
      <strong style={{ color: "#e5e7eb" }}>{statusText}</strong>
      {bridgeLabel ? (
        <span
          style={{
            color: bridgeColor,
            border: `1px solid ${bridgeColor}`,
            borderRadius: "999px",
            padding: "0.1rem 0.55rem",
            fontSize: "0.8rem"
          }}
        >
          {bridgeLabel}
        </span>
      ) : null}
      <button onClick={() => transactions.restartGame()}>Restart</button>
    </div>
  );
};
