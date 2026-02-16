import { describe } from "riteway";
import { createRuneServerDescriptor } from "../dist/index.js";

describe("createRuneServerDescriptor", async (assert) => {
  assert({
    given: "no config is provided",
    should: "create the default descriptor",
    actual: createRuneServerDescriptor(),
    expected: {
      name: "@paralleldrive/rune",
      protocol: "jiron",
      basePath: "/"
    }
  });
});
