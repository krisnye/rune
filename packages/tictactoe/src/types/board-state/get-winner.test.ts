import { describe } from "riteway";
import { getWinner } from "./get-winner.js";

describe("getWinner", async (assert) => {
  assert({
    given: "a winning row of O",
    should: "return O as winner",
    actual: getWinner("OOO      "),
    expected: "O"
  });

  assert({
    given: "a board without a winner",
    should: "return null",
    actual: getWinner("XO XO OX "),
    expected: null
  });
});
