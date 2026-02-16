import { describe } from "riteway";
import { canPlayMove } from "./can-play-move.js";

describe("canPlayMove", async (assert) => {
  assert({
    given: "an out-of-bounds index",
    should: "reject with index_out_of_bounds",
    actual: canPlayMove({ board: "         ", index: 12 }),
    expected: { ok: false, reason: "index_out_of_bounds" }
  });

  assert({
    given: "an occupied cell",
    should: "reject with cell_occupied",
    actual: canPlayMove({ board: "X        ", index: 0 }),
    expected: { ok: false, reason: "cell_occupied" }
  });

  assert({
    given: "a finished board",
    should: "reject with game_over",
    actual: canPlayMove({ board: "XXXOO    ", index: 5 }),
    expected: { ok: false, reason: "game_over" }
  });

  assert({
    given: "an empty cell on active board",
    should: "allow the move",
    actual: canPlayMove({ board: "XO       ", index: 2 }),
    expected: { ok: true }
  });
});
