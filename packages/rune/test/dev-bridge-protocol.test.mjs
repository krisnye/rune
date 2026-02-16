import { describe } from "riteway";
import {
  runeDevBridgeProtocolName,
  runeDevBridgeProtocolVersion,
  createBridgeEnvelope,
  validateBridgeEnvelope,
  hasMatchingRequestId,
  toBridgeError
} from "../dist/index.js";

describe("dev bridge protocol", async (assert) => {
  const envelope = createBridgeEnvelope({
    requestId: "req-1",
    type: "getSnapshot",
    payload: { includeActions: true },
    extensions: { futureFlag: true }
  });

  assert({
    given: "a valid bridge envelope",
    should: "validate successfully",
    actual: validateBridgeEnvelope(envelope),
    expected: { ok: true, value: envelope }
  });

  assert({
    given: "an envelope with an unsupported protocol version",
    should: "return a structured validation error",
    actual: validateBridgeEnvelope({
      ...envelope,
      version: runeDevBridgeProtocolVersion + 1
    }),
    expected: {
      ok: false,
      error: {
        code: "unsupported_protocol_version",
        message: "Bridge protocol version is not supported",
        details: runeDevBridgeProtocolVersion + 1
      }
    }
  });

  assert({
    given: "request and response envelopes with matching request ids",
    should: "report correlation success",
    actual: hasMatchingRequestId(
      createBridgeEnvelope({ requestId: "abc", type: "invokeAction" }),
      createBridgeEnvelope({ requestId: "abc", type: "invokeActionResult" })
    ),
    expected: true
  });

  assert({
    given: "request and response envelopes with different request ids",
    should: "report correlation mismatch",
    actual: hasMatchingRequestId(
      createBridgeEnvelope({ requestId: "abc", type: "invokeAction" }),
      createBridgeEnvelope({ requestId: "xyz", type: "invokeActionResult" })
    ),
    expected: false
  });

  assert({
    given: "an unknown thrown value",
    should: "map it to a stable bridge error shape",
    actual: toBridgeError("boom"),
    expected: {
      code: "internal_error",
      message: "Unknown bridge error",
      details: "boom"
    }
  });

  assert({
    given: "a known bridge error-like object",
    should: "preserve code, message, and details",
    actual: toBridgeError({
      code: "host_unavailable",
      message: "No browser host connected",
      details: { attempts: 2 }
    }),
    expected: {
      code: "host_unavailable",
      message: "No browser host connected",
      details: { attempts: 2 }
    }
  });

  assert({
    given: "protocol constants",
    should: "remain stable for interoperability",
    actual: {
      protocol: runeDevBridgeProtocolName,
      version: runeDevBridgeProtocolVersion
    },
    expected: {
      protocol: "rune-dev-bridge",
      version: 1
    }
  });
});
