import { describe } from "riteway";
import { setBoardCell } from "./set-board-cell.js";

describe("setBoardCell", async (assert) => {
  assert({
    given: "an empty board and a target index",
    should: "set a mark at that index",
    actual: setBoardCell({ board: "         ", index: 4, mark: "X" }),
    expected: "    X    "
  });
});
