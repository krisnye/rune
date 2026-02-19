/**
 * Connect 4 board visualization. 6 rows × 7 columns; yellow (Y) and red (R) pieces.
 * Board logic and types live in types/; this file is UI and layout constants only.
 */

import type { BoardState } from "./types/board-state/board-state.js";
import { BoardState as BoardStateNS } from "./types/board-state/board-state.js";

const CELL_SIZE = 48;
const GAP = 6;
const ROWS = BoardStateNS.ROWS;
const COLS = BoardStateNS.COLS;
const boardEdgePadding = 14;

/** Token diameter so the 2px light blue outline stays visible. */
export const PIECE_SIZE = 40;

type Props = {
  board: BoardState;
  onColumnClick?: (col: number) => void;
};

export function BoardVisualization({ board, onColumnClick }: Props) {
  const cells = board.padEnd(ROWS * COLS, " ").slice(0, ROWS * COLS);
  const width = COLS * CELL_SIZE + (COLS - 1) * GAP;
  const height = ROWS * CELL_SIZE + (ROWS - 1) * GAP;

  const boardDarkBlue = "#0d2847";
  const holeOutlineLighterBlue = "#1a3a5c";
  const yellowOutline = "#b8860b";
  const redOutline = "#a01515";

  const pieceStyles = {
    empty: {
      background: "#0a0a0a",
      boxShadow: `inset 0 0 0 2px ${holeOutlineLighterBlue}`,
    },
    yellow: {
      background: "#f0c000",
      boxShadow: `0 0 0 2px ${yellowOutline}, inset -2px -2px 4px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.3)`,
    },
    red: {
      background: "#d32f2f",
      boxShadow: `0 0 0 2px ${redOutline}, inset -2px -2px 4px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.3)`,
    },
  };

  return (
    <div
      style={{
        display: "inline-block",
        padding: boardEdgePadding,
        background: boardDarkBlue,
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, ${CELL_SIZE}px)`,
          gridTemplateRows: `repeat(${ROWS}, ${CELL_SIZE}px)`,
          gap: GAP,
          width,
          height,
        }}
      >
        {cells.split("").map((cell, index) => {
          const row = Math.floor(index / COLS);
          const col = index % COLS;
          const isEmpty = cell === " ";
          const isYellow = cell === "Y";
          const canDrop =
            onColumnClick && !BoardStateNS.isColumnFull(board, col);

          return (
            <div
              key={`${row}-${col}`}
              role={canDrop ? "button" : undefined}
              tabIndex={canDrop ? 0 : undefined}
              onClick={canDrop ? () => onColumnClick(col) : undefined}
              onKeyDown={
                canDrop
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onColumnClick(col);
                      }
                    }
                  : undefined
              }
              style={{
                width: CELL_SIZE,
                height: CELL_SIZE,
                borderRadius: "50%",
                cursor: canDrop ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                ...pieceStyles.empty,
              }}
              aria-label={
                isEmpty ? "empty" : isYellow ? "yellow piece" : "red piece"
              }
            >
              {!isEmpty && (
                <div
                  style={{
                    width: PIECE_SIZE,
                    height: PIECE_SIZE,
                    borderRadius: "50%",
                    ...(isYellow ? pieceStyles.yellow : pieceStyles.red),
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
