import { describe } from "riteway";
import { createInitialBoard } from "./create-initial-board.js";

describe("createInitialBoard", async (assert) => {
  assert({
    given: "a fresh game board",
    should: "return 9 empty cells as a string",
    actual: createInitialBoard(),
    expected: "         "
  });
});
