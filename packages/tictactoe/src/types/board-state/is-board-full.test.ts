import { describe } from "riteway";
import { isBoardFull } from "./is-board-full.js";

describe("isBoardFull", async (assert) => {
  assert({
    given: "a fully occupied board",
    should: "return true",
    actual: isBoardFull("XOXOOXXXO"),
    expected: true
  });

  assert({
    given: "a board with empty spaces",
    should: "return false",
    actual: isBoardFull("XOXOOXX O"),
    expected: false
  });
});
