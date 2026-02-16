import { describe } from "riteway";
import { currentPlayer } from "./current-player.js";

describe("currentPlayer", async (assert) => {
  assert({
    given: "an empty board",
    should: "return X as the next mark",
    actual: currentPlayer("         "),
    expected: "X"
  });

  assert({
    given: "a board with one X move",
    should: "return O as the next mark",
    actual: currentPlayer("X        "),
    expected: "O"
  });

  assert({
    given: "O is configured to start and board is empty",
    should: "return O as the next mark",
    actual: currentPlayer("         ", "O"),
    expected: "O"
  });

  assert({
    given: "O started and O has made one move",
    should: "return X as the next mark",
    actual: currentPlayer("O        ", "O"),
    expected: "X"
  });
});
