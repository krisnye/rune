import { describe } from "riteway";
import { getWinningLine } from "./get-winning-line.js";

describe("getWinningLine", async (assert) => {
  assert({
    given: "a row win for X",
    should: "return the winning line indexes",
    actual: getWinningLine("XXX      "),
    expected: [0, 1, 2]
  });

  assert({
    given: "a board without a winner",
    should: "return null",
    actual: getWinningLine("XO XO OX "),
    expected: null
  });
});
