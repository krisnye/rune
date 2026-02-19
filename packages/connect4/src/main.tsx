import { createRoot } from "react-dom/client";
import { DatabaseProvider, useObservableValues } from "@adobe/data-react";
import { RuneDevBridgeReact } from "@paralleldrive/rune/react";
import { BoardVisualization, PIECE_SIZE } from "./BoardVisualization.js";
import { agentPlugin } from "./plugins/agent-plugin.js";
import { useConnect4Database } from "./hooks/use-connect4-database.js";
import { BoardState } from "./types/board-state/board-state.js";
import { PlayAgainstAiInstructions } from "./components/PlayAgainstAiInstructions.js";

const YELLOW_OUTLINE = "#b8860b";
const RED_OUTLINE = "#a01515";

function TurnToken({ color }: { color: "Y" | "R" }) {
  const isYellow = color === "Y";
  const outline = isYellow ? YELLOW_OUTLINE : RED_OUTLINE;
  return (
    <div
      style={{
        width: PIECE_SIZE,
        height: PIECE_SIZE,
        borderRadius: "50%",
        background: isYellow ? "#f0c000" : "#d32f2f",
        boxShadow: `0 0 0 2px ${outline}, inset -2px -2px 4px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.3)`,
        flexShrink: 0,
      }}
      aria-hidden
    />
  );
}

function App() {
  const db = useConnect4Database();
  const values = useObservableValues(
    () => ({
      board: db.observe.resources.board,
      firstPlayer: db.observe.resources.firstPlayer,
    }),
    []
  );

  if (!values) return null;

  const currentPlayer = BoardState.currentPlayer(
    values.board,
    values.firstPlayer
  );

  return (
    <div style={{ position: "relative", paddingTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", display: "inline-block" }}>
          <div
            style={{
              position: "absolute",
              right: "100%",
              marginRight: 24,
              top: 0,
              bottom: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <button
              type="button"
              onClick={() => db.transactions.resetGame()}
              style={{
                padding: "6px 14px",
                fontSize: 14,
                cursor: "pointer",
                background: "#1a3a5c",
                color: "#e8e8e8",
                border: "1px solid #2a5d9c",
                borderRadius: 6,
              }}
            >
              Reset
            </button>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 14, opacity: 0.9 }}>Turn</span>
              <TurnToken color={currentPlayer} />
            </div>
          </div>
          <BoardVisualization
            board={values.board}
            onColumnClick={(col) => db.transactions.playMove({ col })}
          />
        </div>
      </div>
    </div>
  );
}

function RuneBridge() {
  const db = useConnect4Database();
  return (
    <RuneDevBridgeReact
      service={db.services.agent}
      hmrClient={import.meta.hot}
    />
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <DatabaseProvider plugin={agentPlugin}>
      <App />
      <RuneBridge />
      <PlayAgainstAiInstructions />
    </DatabaseProvider>
  );
}
