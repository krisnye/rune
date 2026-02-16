import { describe } from "riteway";
import { deriveStatus } from "./derive-status.js";

describe("deriveStatus", async (assert) => {
  assert({
    given: "a board with a winner",
    should: "return won",
    actual: deriveStatus("XXXOO    "),
    expected: "won"
  });

  assert({
    given: "a full board without a winner",
    should: "return draw",
    actual: deriveStatus("XOXOOXXXO"),
    expected: "draw"
  });

  assert({
    given: "a partially played board without winner",
    should: "return in_progress",
    actual: deriveStatus("XO       "),
    expected: "in_progress"
  });
});
