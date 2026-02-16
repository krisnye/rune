import { describe } from "riteway";
import { getMoveCount } from "./get-move-count.js";

describe("getMoveCount", async (assert) => {
  assert({
    given: "a board with X and O marks",
    should: "count only non-empty cells",
    actual: getMoveCount("XO XO    "),
    expected: 4
  });
});
