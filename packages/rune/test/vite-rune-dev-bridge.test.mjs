import { describe } from "riteway";
import {
  createBridgeEnvelope,
  createBridgeHostRegistry,
  createRuneDevBridgeVitePlugin,
  runeDevBridgeEventName
} from "../dist/index.js";

const createMockSocket = () => {
  const handlers = new Map();
  const sent = [];
  return {
    socket: {
      send: (value) => sent.push(value),
      on: (event, handler) => handlers.set(event, handler)
    },
    emitMessage: (payload) => handlers.get("message")?.(payload),
    emitClose: () => handlers.get("close")?.(),
    sent
  };
};

const createRequest = ({ method = "GET", url = "/", body } = {}) => {
  const buffer = body === undefined ? null : Buffer.from(body, "utf8");
  return {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      if (buffer) {
        yield buffer;
      }
    }
  };
};

const createResponseCapture = () => {
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = "") {
      this.body = body;
      resolveDone();
    },
    done
  };
};

const waitForSentEnvelope = async (sent, index) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (typeof sent[index] === "string") {
      return JSON.parse(sent[index]);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for sent envelope at index ${index}`);
};

describe("createBridgeHostRegistry", async (assert) => {
  const registry = createBridgeHostRegistry();
  const first = createMockSocket();
  const second = createMockSocket();

  const firstTransport = { id: first.socket, send: (payload) => first.socket.send(JSON.stringify(payload)) };
  const secondTransport = { id: second.socket, send: (payload) => second.socket.send(JSON.stringify(payload)) };

  const firstResult = registry.registerHost("host-a", firstTransport);
  assert({
    given: "first host socket registers",
    should: "be accepted as active host",
    actual: {
      accepted: firstResult.accepted,
      status: registry.getStatus()
    },
    expected: {
      accepted: true,
      status: { connected: true, hostId: "host-a" }
    }
  });

  const secondResult = registry.registerHost("host-b", secondTransport);

  assert({
    given: "another socket registers while host is active",
    should: "replace the active host",
    actual: secondResult,
    expected: { accepted: true }
  });

  assert({
    given: "second host registration is accepted",
    should: "become the active host",
    actual: registry.getStatus(),
    expected: { connected: true, hostId: "host-b" }
  });

  registry.disconnectTransport(second.socket);
  assert({
    given: "active host disconnects",
    should: "clear host status",
    actual: registry.getStatus(),
    expected: { connected: false, hostId: null }
  });

  assert({
    given: "first host is active",
    should: "expose host transport metadata",
    actual: {
      hostId: registry.registerHost("host-z", firstTransport).accepted ? registry.getHost()?.hostId : null,
      hasTransportId: registry.getHost()?.transportId === first.socket
    },
    expected: {
      hostId: "host-z",
      hasTransportId: true
    }
  });
});

describe("createRuneDevBridgeVitePlugin", async (assert) => {
  let middleware = null;
  const wsHandlers = new Map();
  const plugin = createRuneDevBridgeVitePlugin();
  plugin.configureServer({
    middlewares: {
      use: (handler) => { middleware = handler; }
    },
    ws: {
      on: (event, handler) => { wsHandlers.set(event, handler); }
    }
  });

  const response = createResponseCapture();

  middleware?.({ method: "GET", url: "/__rune_bridge_host" }, response, () => {});
  await response.done;

  assert({
    given: "host status endpoint is requested before registration",
    should: "report no active host",
    actual: JSON.parse(response.body),
    expected: { ok: true, host: { connected: false, hostId: null } }
  });

  const first = createMockSocket();
  const second = createMockSocket();

  wsHandlers.get("connection")?.(first.socket, { url: "/__rune_bridge_ws" });
  wsHandlers.get("connection")?.(second.socket, { url: "/__rune_bridge_ws" });

  first.emitMessage(JSON.stringify(createBridgeEnvelope({
    requestId: "1",
    type: "registerHost",
    payload: { hostId: "tab-1" }
  })));

  second.emitMessage(JSON.stringify(createBridgeEnvelope({
    requestId: "2",
    type: "registerHost",
    payload: { hostId: "tab-2" }
  })));

  const firstResponse = JSON.parse(first.sent[0]);
  const secondResponse = JSON.parse(second.sent[0]);

  assert({
    given: "first and second websocket clients try to register host",
    should: "allow second registration to take over",
    actual: {
      firstAccepted: firstResponse.payload.accepted,
      firstActiveHost: firstResponse.payload.activeHostId,
      secondAccepted: secondResponse.payload.accepted,
      secondActiveHost: secondResponse.payload.activeHostId
    },
    expected: {
      firstAccepted: true,
      firstActiveHost: "tab-1",
      secondAccepted: true,
      secondActiveHost: "tab-2"
    }
  });

  second.emitClose();

  const postCloseResponse = createResponseCapture();

  middleware?.({ method: "GET", url: "/__rune_bridge_host" }, postCloseResponse, () => {});
  await postCloseResponse.done;

  assert({
    given: "active host disconnects",
    should: "show host as unavailable in status endpoint",
    actual: JSON.parse(postCloseResponse.body),
    expected: { ok: true, host: { connected: false, hostId: null } }
  });
});

describe("createRuneDevBridgeVitePlugin relay routes", async (assert) => {
  let middleware = null;
  const wsHandlers = new Map();
  const plugin = createRuneDevBridgeVitePlugin();
  plugin.configureServer({
    middlewares: {
      use: (handler) => { middleware = handler; }
    },
    ws: {
      on: (event, handler) => { wsHandlers.set(event, handler); }
    }
  });

  const noHostResponse = createResponseCapture();
  middleware?.(createRequest({ method: "GET", url: "/__rune_bridge" }), noHostResponse, () => {});
  await noHostResponse.done;

  assert({
    given: "bridge snapshot endpoint has no active host",
    should: "return bridge unavailable response",
    actual: {
      statusCode: noHostResponse.statusCode,
      code: JSON.parse(noHostResponse.body).error.code
    },
    expected: {
      statusCode: 503,
      code: "bridge_unavailable"
    }
  });

  const host = createMockSocket();
  wsHandlers.get("connection")?.(host.socket, { url: "/__rune_bridge_ws" });
  host.emitMessage(JSON.stringify(createBridgeEnvelope({
    requestId: "register-1",
    type: "registerHost",
    payload: { hostId: "tab-1" }
  })));

  const snapshotResponse = createResponseCapture();
  middleware?.(createRequest({ method: "GET", url: "/__rune_bridge" }), snapshotResponse, () => {});
  const snapshotRequestEnvelope = await waitForSentEnvelope(host.sent, 1);
  host.emitMessage(JSON.stringify(createBridgeEnvelope({
    requestId: snapshotRequestEnvelope.requestId,
    type: "getSnapshotResult",
    payload: {
      ok: true,
      snapshot: { revision: 1 }
    }
  })));
  await snapshotResponse.done;

  assert({
    given: "bridge snapshot endpoint with active host",
    should: "relay request and return host payload",
    actual: JSON.parse(snapshotResponse.body),
    expected: {
      ok: true,
      snapshot: { revision: 1 }
    }
  });

  const actionResponse = createResponseCapture();
  middleware?.(createRequest({
    method: "POST",
    url: "/__rune_bridge/actions/playMove",
    body: JSON.stringify(4)
  }), actionResponse, () => {});
  const actionRequestEnvelope = await waitForSentEnvelope(host.sent, 2);
  host.emitMessage(JSON.stringify(createBridgeEnvelope({
    requestId: actionRequestEnvelope.requestId,
    type: "invokeActionResult",
    payload: {
      ok: true,
      snapshot: { revision: 2 }
    }
  })));
  await actionResponse.done;

  assert({
    given: "action relay endpoint receives action input",
    should: "forward actionName and input to host",
    actual: {
      forwardedType: actionRequestEnvelope.type,
      forwardedAction: actionRequestEnvelope.payload.actionName,
      forwardedInput: actionRequestEnvelope.payload.input,
      response: JSON.parse(actionResponse.body)
    },
    expected: {
      forwardedType: "invokeAction",
      forwardedAction: "playMove",
      forwardedInput: 4,
      response: {
        ok: true,
        snapshot: { revision: 2 }
      }
    }
  });

  const waitResponse = createResponseCapture();
  middleware?.(createRequest({
    method: "POST",
    url: "/__rune_bridge/actions/wait",
    body: ""
  }), waitResponse, () => {});
  const waitRequestEnvelope = await waitForSentEnvelope(host.sent, 3);
  host.emitMessage(JSON.stringify(createBridgeEnvelope({
    requestId: waitRequestEnvelope.requestId,
    type: "waitForChangeResult",
    payload: {
      ok: true,
      timedOut: true,
      snapshot: { revision: 2 }
    }
  })));
  await waitResponse.done;

  assert({
    given: "wait relay endpoint is called without body",
    should: "forward waitForChange with undefined payload",
    actual: {
      forwardedType: waitRequestEnvelope.type,
      forwardedPayload: waitRequestEnvelope.payload,
      response: JSON.parse(waitResponse.body)
    },
    expected: {
      forwardedType: "waitForChange",
      forwardedPayload: undefined,
      response: {
        ok: true,
        timedOut: true,
        snapshot: { revision: 2 }
      }
    }
  });
});

describe("createRuneDevBridgeVitePlugin hmr transport", async (assert) => {
  let middleware = null;
  const wsHandlers = new Map();
  const plugin = createRuneDevBridgeVitePlugin();
  plugin.configureServer({
    middlewares: {
      use: (handler) => { middleware = handler; }
    },
    ws: {
      on: (event, handler) => { wsHandlers.set(event, handler); }
    }
  });

  const sent = [];
  const hmrClient = {
    send: (_event, payload) => sent.push(payload)
  };

  wsHandlers.get(runeDevBridgeEventName)?.(
    createBridgeEnvelope({
      requestId: "register-hmr-1",
      type: "registerHost",
      payload: { hostId: "hmr-tab-1" }
    }),
    hmrClient
  );

  const hostStatusResponse = createResponseCapture();
  middleware?.(createRequest({ method: "GET", url: "/__rune_bridge_host" }), hostStatusResponse, () => {});
  await hostStatusResponse.done;

  assert({
    given: "host registers via vite hmr custom event channel",
    should: "become active bridge host",
    actual: JSON.parse(hostStatusResponse.body),
    expected: { ok: true, host: { connected: true, hostId: "hmr-tab-1" } }
  });

  const snapshotResponse = createResponseCapture();
  middleware?.(createRequest({ method: "GET", url: "/__rune_bridge" }), snapshotResponse, () => {});
  const relayRequest = sent[sent.length - 1];

  wsHandlers.get(runeDevBridgeEventName)?.(
    createBridgeEnvelope({
      requestId: relayRequest.requestId,
      type: "getSnapshotResult",
      payload: { ok: true, snapshot: { revision: 11 } }
    }),
    hmrClient
  );

  await snapshotResponse.done;

  assert({
    given: "relay route is called with hmr host active",
    should: "return relayed payload from hmr host",
    actual: JSON.parse(snapshotResponse.body),
    expected: { ok: true, snapshot: { revision: 11 } }
  });
});
