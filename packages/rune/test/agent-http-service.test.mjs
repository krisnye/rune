import { describe } from "riteway";
import { Observe } from "@adobe/data/observe";
import { createAgentHttpService } from "../dist/index.js";

const createMockAgenticService = () => {
  const [statesObserve, setStates] = Observe.createState({
    turn: { schema: { type: "string" }, value: "agent" },
    board: { schema: { type: "array", items: { type: "string" } }, value: Array(9).fill(" ") }
  });

  let board = Array(9).fill(" ");
  let currentTurn = "agent";

  const emitState = () => {
    setStates({
      turn: { schema: { type: "string" }, value: currentTurn },
      board: { schema: { type: "array", items: { type: "string" } }, value: board }
    });
  };

  const [actionsObserve, setActions] = Observe.createState({});
  let currentActions = {};

  const emitActions = () => {
    const actions = currentTurn === "agent"
      ? {
          playMove: {
            schema: { type: "integer", minimum: 0, maximum: 8 },
            execute: async (index) => {
              if (!Number.isInteger(index) || index < 0 || index > 8 || board[index] !== " ") {
                return "invalid_move";
              }
              board = board.map((cell, cellIndex) => (cellIndex === index ? "O" : cell));
              currentTurn = "human";
              emitState();
              emitActions();
              return undefined;
            }
          }
        }
      : {};
    currentActions = actions;
    setActions(actions);
  };

  emitActions();
  emitState();

  return {
    service: {
      serviceName: "agentic-service",
      states: statesObserve,
      actions: actionsObserve,
      execute: async (actionName, input) => {
        const action = currentActions[actionName];
        if (!action) {
          return `Action "${actionName}" is not available`;
        }
        return action.execute(input);
      }
    },
    simulateHumanMove: (index = 0) => {
      board = board.map((cell, cellIndex) => (cellIndex === index ? "X" : cell));
      currentTurn = "agent";
      emitState();
      emitActions();
    }
  };
};

describe("createAgentHttpService", async (assert) => {
  const { service, simulateHumanMove } = createMockAgenticService();
  const agentHttp = createAgentHttpService({
    service,
    host: "127.0.0.1",
    port: 0,
    maxWaitMs: 200
  });

  const startResult = await agentHttp.start();
  const rootResponse = await fetch(startResult.info.url);
  const rootPayload = await rootResponse.json();

  assert({
    given: "service has started",
    should: "serve the current snapshot on GET /",
    actual: {
      status: rootResponse.status,
      ok: rootPayload.ok,
      hasPlayMove: Boolean(rootPayload?.snapshot?.actions?.playMove),
      hasWait: Boolean(rootPayload?.snapshot?.actions?.wait)
    },
    expected: {
      status: 200,
      ok: true,
      hasPlayMove: true,
      hasWait: true
    }
  });

  const playResponse = await fetch(`${startResult.info.origin}/actions/playMove`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(4)
  });
  const playPayload = await playResponse.json();

  assert({
    given: "agent executes a valid action",
    should: "return an updated snapshot",
    actual: {
      status: playResponse.status,
      ok: playPayload.ok,
      turn: playPayload?.snapshot?.states?.turn?.value
    },
    expected: {
      status: 200,
      ok: true,
      turn: "human"
    }
  });

  const waitStart = Date.now();
  const waitPromise = fetch(`${startResult.info.origin}/actions/wait`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      since: playPayload.snapshot.revision,
      timeoutMs: 1_000
    })
  });

  setTimeout(() => {
    simulateHumanMove(0);
  }, 50);

  const waitResponse = await waitPromise;
  const waitPayload = await waitResponse.json();
  const waitElapsed = Date.now() - waitStart;

  assert({
    given: "agent waits for next revision",
    should: "unblock when state changes",
    actual: {
      status: waitResponse.status,
      timedOut: waitPayload.timedOut,
      turn: waitPayload?.snapshot?.states?.turn?.value,
      elapsedUnderTimeout: waitElapsed < 1_000
    },
    expected: {
      status: 200,
      timedOut: false,
      turn: "agent",
      elapsedUnderTimeout: true
    }
  });

  const timeoutWait = await fetch(`${startResult.info.origin}/actions/wait`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      since: waitPayload.snapshot.revision,
      timeoutMs: 100
    })
  });
  const timeoutPayload = await timeoutWait.json();

  assert({
    given: "no state changes happen while waiting",
    should: "return a timed out wait response",
    actual: {
      status: timeoutWait.status,
      timedOut: timeoutPayload.timedOut
    },
    expected: {
      status: 200,
      timedOut: true
    }
  });

  const waitWithoutBody = await fetch(`${startResult.info.origin}/actions/wait`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: ""
  });
  const waitWithoutBodyPayload = await waitWithoutBody.json();

  assert({
    given: "wait is called without input",
    should: "use default wait values and still succeed",
    actual: {
      status: waitWithoutBody.status,
      ok: waitWithoutBodyPayload.ok,
      timedOut: typeof waitWithoutBodyPayload.timedOut === "boolean"
    },
    expected: {
      status: 200,
      ok: true,
      timedOut: true
    }
  });

  await agentHttp.dispose();

  assert({
    given: "service is disposed",
    should: "report not running",
    actual: agentHttp.isRunning(),
    expected: false
  });

  const { service: uiService } = createMockAgenticService();
  const noUiHttp = createAgentHttpService({
    service: uiService,
    host: "127.0.0.1",
    port: 0
  });
  const noUiStart = await noUiHttp.start();
  const noUiResponse = await fetch(`${noUiStart.info.origin}/ui`);
  await noUiHttp.dispose();

  assert({
    given: "ui is disabled",
    should: "not expose the ui route",
    actual: noUiResponse.status,
    expected: 404
  });

  const { service: enabledUiService } = createMockAgenticService();
  const uiHttp = createAgentHttpService({
    service: enabledUiService,
    host: "127.0.0.1",
    port: 0,
    enableUi: true
  });
  const uiStart = await uiHttp.start();
  const uiResponse = await fetch(`${uiStart.info.origin}/ui`);
  const uiHtml = await uiResponse.text();
  await uiHttp.dispose();

  assert({
    given: "ui is enabled",
    should: "serve an html ui document",
    actual: {
      status: uiResponse.status,
      hasHtmlTag: uiHtml.includes("<html"),
      hasActionControls: uiHtml.includes("Run Action")
    },
    expected: {
      status: 200,
      hasHtmlTag: true,
      hasActionControls: true
    }
  });
});
