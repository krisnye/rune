import { Observe } from "@adobe/data/observe";
import { DynamicService } from "@adobe/data/service";

const bridgeProtocol = "rune-dev-bridge";
const bridgeVersion = 1;
const bridgeWsPath = "/__rune_bridge_ws";
const bridgeEventName = "rune-dev-bridge:event";
const bridgeActionsBasePath = "/__rune_bridge/actions/";
const bridgeDefaultWaitTimeoutMs = 30_000;

type BridgeEnvelope = {
  readonly protocol: typeof bridgeProtocol;
  readonly version: typeof bridgeVersion;
  readonly requestId: string;
  readonly type: string;
  readonly payload?: unknown;
  readonly extensions?: Record<string, unknown>;
};

type BridgeSnapshot = {
  readonly revision: number;
  readonly states: Record<string, { readonly schema: unknown; readonly value: unknown }>;
  readonly actions: Record<string, { readonly schema: unknown; readonly method: "POST"; readonly href: string; readonly meta?: true }>;
};

type WaitRequest = {
  readonly since: number;
  readonly timeoutMs: number;
};

type BridgeRuntime = {
  readonly stop: () => void;
};

export interface RuneDevBridgeStatus {
  readonly socketConnected: boolean;
  readonly hostAccepted: boolean;
  readonly hostId: string;
}

const createEnvelope = ({
  requestId,
  type,
  payload,
  extensions
}: {
  readonly requestId: string;
  readonly type: string;
  readonly payload?: unknown;
  readonly extensions?: Record<string, unknown>;
}): BridgeEnvelope => ({
  protocol: bridgeProtocol,
  version: bridgeVersion,
  requestId,
  type,
  payload,
  extensions
});

const validateEnvelope = (value: unknown): BridgeEnvelope | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const envelope = value as Record<string, unknown>;
  if (envelope.protocol !== bridgeProtocol) {
    return null;
  }
  if (envelope.version !== bridgeVersion) {
    return null;
  }
  if (typeof envelope.requestId !== "string" || envelope.requestId.trim() === "") {
    return null;
  }
  if (typeof envelope.type !== "string" || envelope.type.trim() === "") {
    return null;
  }
  return envelope as BridgeEnvelope;
};

const parseWaitRequest = (payload: unknown): WaitRequest | null => {
  if (payload === undefined) {
    return { since: 0, timeoutMs: bridgeDefaultWaitTimeoutMs };
  }

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const maybeSince = (payload as Record<string, unknown>).since;
  const maybeTimeoutMs = (payload as Record<string, unknown>).timeoutMs;
  const since = maybeSince === undefined
    ? 0
    : Number.isInteger(maybeSince) && Number(maybeSince) >= 0
      ? Number(maybeSince)
      : NaN;

  if (!Number.isInteger(since) || since < 0) {
    return null;
  }

  const timeoutMs = Number.isFinite(maybeTimeoutMs)
    ? Math.max(0, Math.min(Number(maybeTimeoutMs), bridgeDefaultWaitTimeoutMs))
    : bridgeDefaultWaitTimeoutMs;

  return { since, timeoutMs };
};

const toSocketUrl = (wsPath: string): string => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${wsPath}`;
};

type HmrClient = {
  readonly send: (event: string, payload: unknown) => void;
  readonly on: (event: string, callback: (payload: unknown) => void) => void;
  readonly off?: (event: string, callback: (payload: unknown) => void) => void;
};

const getHmrClient = (): HmrClient | null => {
  if (!import.meta.env.DEV) {
    return null;
  }
  const maybeHot = (import.meta as unknown as { hot?: HmrClient }).hot;
  return maybeHot ?? null;
};

const createHostId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `host-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const createRuneBrowserHost = ({
  service,
  wsPath = bridgeWsPath,
  reconnectDelayMs = 1_000,
  onStatusChange
}: {
  readonly service: DynamicService.DynamicService;
  readonly wsPath?: string;
  readonly reconnectDelayMs?: number;
  readonly onStatusChange?: (status: RuneDevBridgeStatus) => void;
}): BridgeRuntime => {
  let disposed = false;
  let revision = 0;
  let snapshot: BridgeSnapshot | null = null;
  let currentStates: Record<string, { readonly schema: unknown; readonly value: unknown }> = {};
  let currentActions: Record<string, { readonly schema: unknown; readonly execute: (input?: unknown) => Promise<unknown> }> = {};
  let nextRequestId = 1;
  let socket: WebSocket | null = null;
  let hmrClient: HmrClient | null = null;
  let hmrListener: ((payload: unknown) => void) | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let waitListeners: Array<{ readonly since: number; readonly resolve: (timedOut: boolean) => void; readonly timer: ReturnType<typeof setTimeout> }> = [];
  const hostId = createHostId();
  let status: RuneDevBridgeStatus = {
    socketConnected: false,
    hostAccepted: false,
    hostId
  };

  const setStatus = (next: RuneDevBridgeStatus): void => {
    status = next;
    onStatusChange?.(status);
  };

  const buildSnapshot = (): BridgeSnapshot => ({
    revision,
    states: currentStates,
    actions: {
      ...Object.fromEntries(
        Object.entries(currentActions).map(([actionName, action]) => [
          actionName,
          {
            schema: action.schema,
            method: "POST" as const,
            href: `${bridgeActionsBasePath}${encodeURIComponent(actionName)}`
          }
        ])
      ),
      wait: {
        schema: {
          type: "object",
          properties: {
            since: { type: "integer", minimum: 0 },
            timeoutMs: { type: "integer", minimum: 0, maximum: bridgeDefaultWaitTimeoutMs }
          },
          additionalProperties: false
        },
        method: "POST",
        href: `${bridgeActionsBasePath}wait`,
        meta: true
      }
    }
  });

  const resolveWaiters = (): void => {
    const pending: typeof waitListeners = [];
    waitListeners.forEach((listener) => {
      if (listener.since === revision) {
        pending.push(listener);
        return;
      }
      clearTimeout(listener.timer);
      listener.resolve(false);
    });
    waitListeners = pending;
  };

  const unobserve = Observe.fromProperties({
    states: service.states,
    actions: service.actions
  })(({ states, actions }) => {
    revision += 1;
    currentStates = states as Record<string, { readonly schema: unknown; readonly value: unknown }>;
    currentActions = actions as Record<string, { readonly schema: unknown; readonly execute: (input?: unknown) => Promise<unknown> }>;
    snapshot = buildSnapshot();
    resolveWaiters();
  });

  const send = (type: string, requestId: string, payload?: unknown): void => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(createEnvelope({
      requestId,
      type,
      payload,
      extensions: { hostId }
    })));
  };

  const sendHmr = (hmr: HmrClient, type: string, requestId: string, payload?: unknown): void => {
    hmr.send(bridgeEventName, createEnvelope({
      requestId,
      type,
      payload,
      extensions: { hostId }
    }));
  };

  const sendBridge = (type: string, requestId: string, payload?: unknown): void => {
    if (hmrClient) {
      sendHmr(hmrClient, type, requestId, payload);
      return;
    }
    send(type, requestId, payload);
  };

  const waitForChange = async (payload: unknown): Promise<{ readonly ok: boolean; readonly timedOut: boolean; readonly snapshot: BridgeSnapshot | null } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }> => {
    const parsed = parseWaitRequest(payload);
    if (!parsed) {
      return {
        ok: false,
        error: {
          code: "invalid_wait_input",
          message: "waitForChange accepts optional { since?: integer, timeoutMs?: integer }"
        }
      };
    }

    const effectiveSince = parsed.since === 0 ? revision : parsed.since;
    if (effectiveSince !== revision) {
      return { ok: true, timedOut: false, snapshot };
    }

    const timedOut = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        waitListeners = waitListeners.filter((listener) => listener.timer !== timer);
        resolve(true);
      }, parsed.timeoutMs);

      waitListeners.push({
        since: effectiveSince,
        timer,
        resolve
      });
    });

    return { ok: true, timedOut, snapshot };
  };

  const handleRequest = async (envelope: BridgeEnvelope): Promise<void> => {
    if (!snapshot) {
      return;
    }

    if (envelope.type === "getSnapshot") {
      sendBridge("getSnapshotResult", envelope.requestId, { ok: true, snapshot });
      return;
    }

    if (envelope.type === "invokeAction") {
      const payload = envelope.payload as { actionName?: unknown; input?: unknown } | undefined;
      const actionName = typeof payload?.actionName === "string" ? payload.actionName : "";
      if (actionName.trim() === "") {
        sendBridge("invokeActionResult", envelope.requestId, {
          ok: false,
          error: {
            code: "invalid_action_name",
            message: "invokeAction requires actionName"
          },
          snapshot
        });
        return;
      }

      const result = await service.execute(actionName, payload?.input);
      sendBridge("invokeActionResult", envelope.requestId, typeof result === "string"
        ? {
            ok: false,
            error: {
              code: "action_rejected",
              message: result
            },
            snapshot
          }
        : {
            ok: true,
            snapshot
          });
      return;
    }

    if (envelope.type === "waitForChange") {
      const result = await waitForChange(envelope.payload);
      sendBridge("waitForChangeResult", envelope.requestId, result);
    }
  };

  const connect = (): void => {
    if (disposed) {
      return;
    }

    const hmr = getHmrClient();
    if (hmr) {
      const onMessage = (raw: unknown) => {
        try {
          const wrapped = typeof raw === "object" && raw !== null && "envelope" in (raw as Record<string, unknown>)
            ? raw as { envelope: unknown; toHostId?: unknown }
            : null;

          if (wrapped && typeof wrapped.toHostId === "string" && wrapped.toHostId !== hostId) {
            return;
          }

          const envelope = validateEnvelope(wrapped ? wrapped.envelope : raw);
          if (!envelope) {
            return;
          }
          if (envelope.type === "registerHostResult") {
            const payload = envelope.payload as { accepted?: unknown; activeHostId?: unknown } | undefined;
            const accepted = payload?.accepted === true;
            const activeHostId = typeof payload?.activeHostId === "string" ? payload.activeHostId : null;
            setStatus({
              socketConnected: true,
              hostAccepted: accepted && activeHostId === hostId,
              hostId
            });
            return;
          }
          void handleRequest(envelope);
        } catch {
          // Ignore malformed bridge messages.
        }
      };

      setStatus({
        socketConnected: true,
        hostAccepted: false,
        hostId
      });
      hmrClient = hmr;
      hmrListener = onMessage;
      hmr.on(bridgeEventName, onMessage);
      sendHmr(hmr, "registerHost", `register-${nextRequestId}`, { hostId });
      nextRequestId += 1;
      return;
    }

    const next = new WebSocket(toSocketUrl(wsPath));
    socket = next;

    next.addEventListener("open", () => {
      setStatus({
        socketConnected: true,
        hostAccepted: false,
        hostId
      });
      send("registerHost", `register-${nextRequestId}`, { hostId });
      nextRequestId += 1;
    });

    next.addEventListener("message", (event) => {
      try {
        const parsed = JSON.parse(String(event.data));
        const envelope = validateEnvelope(parsed);
        if (!envelope) {
          return;
        }
        if (envelope.type === "registerHostResult") {
          const payload = envelope.payload as { accepted?: unknown; activeHostId?: unknown } | undefined;
          const accepted = payload?.accepted === true;
          const activeHostId = typeof payload?.activeHostId === "string" ? payload.activeHostId : null;
          setStatus({
            socketConnected: true,
            hostAccepted: accepted && activeHostId === hostId,
            hostId
          });
          return;
        }
        void handleRequest(envelope);
      } catch {
        // Ignore malformed bridge messages.
      }
    });

    next.addEventListener("close", () => {
      setStatus({
        socketConnected: false,
        hostAccepted: false,
        hostId
      });
      if (disposed) {
        return;
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, reconnectDelayMs);
    });
  };

  connect();

  return {
    stop: () => {
      disposed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      waitListeners.forEach((listener) => clearTimeout(listener.timer));
      waitListeners = [];
      if (socket) {
        socket.close();
        socket = null;
      }
      if (hmrClient && hmrListener && typeof hmrClient.off === "function") {
        hmrClient.off(bridgeEventName, hmrListener);
      }
      hmrClient = null;
      hmrListener = null;
      setStatus({
        socketConnected: false,
        hostAccepted: false,
        hostId
      });
      unobserve();
    }
  };
};
