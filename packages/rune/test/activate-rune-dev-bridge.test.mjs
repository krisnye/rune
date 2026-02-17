import { describe } from "riteway";
import { activateRuneDevBridge } from "../dist/index.js";

describe("activateRuneDevBridge", async (assert) => {
  const fakeService = {
    states: {},
    actions: {},
    execute: async () => undefined
  };

  const disabled = await activateRuneDevBridge({
    service: fakeService,
    enabled: false
  });

  assert({
    given: "bridge activation is explicitly disabled",
    should: "return an inert handle",
    actual: {
      enabled: disabled.enabled,
      element: disabled.element,
      status: disabled.getStatus()
    },
    expected: {
      enabled: false,
      element: null,
      status: {
        socketConnected: false,
        hostAccepted: false,
        hostId: ""
      }
    }
  });

  disabled.stop();

  const defaultDisabled = await activateRuneDevBridge({
    service: fakeService
  });

  assert({
    given: "bridge activation has no explicit enabled flag in Node runtime",
    should: "default to an inert disabled handle",
    actual: defaultDisabled.enabled,
    expected: false
  });
});
