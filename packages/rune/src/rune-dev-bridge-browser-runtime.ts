import { Observe } from "@adobe/data/observe";
import { AgenticService } from "@adobe/data/service";
import { createBridgeEnvelope, validateBridgeEnvelope } from "./dev-bridge-protocol.js";
import {
  runeDevBridgeEventName,
  runeDevBridgeWsPath
} from "./vite-rune-dev-bridge.js";
import {
  createDefaultBridgeStatus,
  type RuneDevBridgeStatus
} from "./rune-dev-bridge-client-types.js";

const bridgeActionsBasePath = "/__rune_bridge/actions/";
const bridgeDefaultWaitTimeoutMs = 60_000;

type BridgeAction = {
  readonly description: string;
  readonly inputSchema?: unknown;
  readonly method: "POST";
  readonly href: string;
  readonly bodyDescription?: string;
  readonly meta?: true;
};

type BridgeSnapshot = {
  /** Service description (purpose, role). Only included in getSnapshot; omitted from wait/action responses. */
  readonly description?: string;
  readonly revision: number;
  readonly states: Record<string, { readonly schema: unknown; readonly value: unknown }>;
  readonly actions: Record<string, BridgeAction>;
};

type WaitRequest = {
  readonly since: number;
  readonly timeoutMs: number;
};

type BridgeRuntime = {
  readonly stop: () => void;
  readonly getStatus: () => RuneDevBridgeStatus;
};

type RuntimeOptions = {
  readonly service: AgenticService;
  readonly wsPath?: string;
  readonly reconnectDelayMs?: number;
  readonly hmrClient?: HmrClient;
  readonly onStatusChange?: (status: RuneDevBridgeStatus) => void;
};

type BridgeWebSocket = {
  readonly OPEN: number;
  readonly readyState: number;
  readonly send: (value: string) => void;
  readonly close: () => void;
  readonly addEventListener: (event: "open" | "message" | "close", listener: (event?: unknown) => void) => void;
};

type HmrClient = {
  readonly send: (event: string, payload: unknown) => void;
  readonly on: (event: string, callback: (payload: unknown) => void) => void;
  readonly off?: (event: string, callback: (payload: unknown) => void) => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Schema for the request body: use action's input schema if present, else the whole schema. */
const bodySchema = (action: { readonly schema: unknown }): unknown =>
  isRecord(action.schema) && "input" in action.schema
    ? (action.schema as { input: unknown }).input
    : action.schema;

const parseWaitRequest = (payload: unknown): WaitRequest | null => {
  if (payload === undefined) {
    return { since: 0, timeoutMs: bridgeDefaultWaitTimeoutMs };
  }

  if (!isRecord(payload)) {
    return null;
  }

  const maybeSince = payload.since;
  const maybeTimeoutMs = payload.timeoutMs;
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

const getWindowLocation = (): { readonly protocol: string; readonly host: string } | null => {
  const maybeWindow = (globalThis as { readonly window?: unknown }).window;
  if (!isRecord(maybeWindow) || !isRecord(maybeWindow.location)) {
    return null;
  }

  const protocol = typeof maybeWindow.location.protocol === "string" ? maybeWindow.location.protocol : "";
  const host = typeof maybeWindow.location.host === "string" ? maybeWindow.location.host : "";
  return protocol && host ? { protocol, host } : null;
};

const toSocketUrl = (wsPath: string): string => {
  const location = getWindowLocation();
  if (!location) {
    throw new Error("Rune dev bridge host requires a browser runtime");
  }

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}${wsPath}`;
};

const getHmrClient = (): HmrClient | null => {
  const maybeImportMeta = import.meta as unknown as { readonly env?: { readonly DEV?: unknown }; readonly hot?: HmrClient };
  if (maybeImportMeta.env?.DEV !== true) {
    return null;
  }
  return maybeImportMeta.hot ?? null;
};

const createHostId = (): string => {
  const maybeCrypto = (globalThis as { readonly crypto?: { readonly randomUUID?: () => string } }).crypto;
  if (maybeCrypto && typeof maybeCrypto.randomUUID === "function") {
    return maybeCrypto.randomUUID();
  }

  return `host-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createSocket = (wsPath: string): BridgeWebSocket => {
  const wsConstructor = (globalThis as { readonly WebSocket?: new (url: string) => BridgeWebSocket }).WebSocket;
  if (!wsConstructor) {
    throw new Error("Rune dev bridge host requires WebSocket support");
  }
  return new wsConstructor(toSocketUrl(wsPath));
};

export const createRuneBrowserHostRuntime = ({
  service,
  wsPath = runeDevBridgeWsPath,
  reconnectDelayMs = 1_000,
  hmrClient: providedHmrClient,
  onStatusChange
}: RuntimeOptions): BridgeRuntime => {
  let disposed = false;
  let revision = 0;
  let snapshot: BridgeSnapshot | null = null;
  let currentStates: Record<string, { readonly schema: unknown; readonly value: unknown }> = {};
  let currentActions: Record<string, { readonly description?: string; readonly schema: unknown; readonly execute: (input?: unknown) => Promise<unknown> }> = {};
  let nextRequestId = 1;
  let socket: BridgeWebSocket | null = null;
  let hmrClient: HmrClient | null = null;
  let hmrListener: ((payload: unknown) => void) | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let waitListeners: Array<{ readonly since: number; readonly resolve: (timedOut: boolean) => void; readonly timer: ReturnType<typeof setTimeout> }> = [];
  const hostId = createHostId();
  let status = createDefaultBridgeStatus({ hostId });

  const setStatus = (next: RuneDevBridgeStatus): void => {
    status = next;
    onStatusChange?.(status);
  };

  const buildAction = (
    description: string,
    inputSchema: unknown | undefined | false,
    href: string,
    meta?: true
  ): BridgeAction => {
    const hasInput = inputSchema !== undefined && inputSchema !== false;
    return {
      description,
      ...(hasInput ? { inputSchema } : {}),
      method: "POST" as const,
      href,
      ...(hasInput ? { bodyDescription: "JSON value matching inputSchema" } : {}),
      ...(meta === true ? { meta: true as const } : {})
    };
  };

  const buildSnapshot = (): BridgeSnapshot => {
    const serviceActions = Object.fromEntries(
      Object.entries(currentActions).map(([actionName, action]) => {
        const inputSchema = bodySchema(action);
        const description = typeof action.description === "string" ? action.description : actionName;
        return [
          actionName,
          buildAction(
            description,
            inputSchema,
            `${bridgeActionsBasePath}${encodeURIComponent(actionName)}`
          )
        ];
      })
    );
    const hasOtherActions = Object.keys(currentActions).length > 0;
    const actions = hasOtherActions
      ? serviceActions
      : {
          ...serviceActions,
          wait: buildAction(
            "Wait for the snapshot to change. Only available when no other actions are available. " +
            "Send the current snapshot's revision in the optional `since` field; the request resolves when the revision changes or after `timeoutMs` (default 60 seconds). " +
            "Body: optional { since?: number, timeoutMs?: number }.",
            {
              type: "object",
              properties: {
                since: { type: "integer", minimum: 0, description: "Snapshot revision to wait for a change from; omit or use current snapshot.revision" },
                timeoutMs: { type: "integer", minimum: 0, maximum: bridgeDefaultWaitTimeoutMs, description: "Max milliseconds to wait (default 60000)" }
              },
              additionalProperties: false
            },
            `${bridgeActionsBasePath}wait`,
            true
          )
        };
    return { revision, states: currentStates, actions };
  };

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
    currentActions = actions as Record<string, { readonly description?: string; readonly schema: unknown; readonly execute: (input?: unknown) => Promise<unknown> }>;
    snapshot = buildSnapshot();
    resolveWaiters();
  });

  const send = (type: string, requestId: string, payload?: unknown): void => {
    if (!socket || socket.readyState !== socket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(createBridgeEnvelope({
      requestId,
      type,
      payload,
      extensions: { hostId }
    })));
  };

  const sendHmr = (hmr: HmrClient, type: string, requestId: string, payload?: unknown): void => {
    hmr.send(runeDevBridgeEventName, createBridgeEnvelope({
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

  const waitForChange = async (
    payload: unknown
  ): Promise<
    | { readonly ok: true; readonly timedOut: boolean; readonly snapshot: BridgeSnapshot | null }
    | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
  > => {
    if (Object.keys(currentActions).length > 0) {
      return {
        ok: false,
        error: {
          code: "action_unavailable",
          message: "wait is only available when no other actions are available"
        }
      };
    }
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

  const handleRequest = async (envelope: { readonly requestId: string; readonly type: string; readonly payload?: unknown }): Promise<void> => {
    if (!snapshot) {
      return;
    }

    if (envelope.type === "getSnapshot") {
      const desc = (service as unknown as { description?: (cb: (v: unknown) => void) => unknown }).description;
      const raw = typeof desc === "function" ? await Observe.toPromise(desc as Observe<string>) : undefined;
      const serviceDescription = typeof raw === "string" ? raw : undefined;
      const payload =
        serviceDescription !== undefined
          ? { description: serviceDescription, revision: snapshot.revision, states: snapshot.states, actions: snapshot.actions }
          : snapshot;
      sendBridge("getSnapshotResult", envelope.requestId, payload);
      return;
    }

    if (envelope.type === "invokeAction") {
      const payload = envelope.payload as { actionName?: unknown; input?: unknown } | undefined;
      const actionName = typeof payload?.actionName === "string" ? payload.actionName : "";
      if (actionName.trim() === "") {
        sendBridge("invokeActionResult", envelope.requestId, {
          error: { code: "invalid_action_name", message: "invokeAction requires actionName" },
          revision: snapshot.revision,
          states: snapshot.states,
          actions: snapshot.actions
        });
        return;
      }

      const result = await service.execute(actionName, payload?.input);
      if (typeof result === "string") {
        sendBridge("invokeActionResult", envelope.requestId, {
          error: { code: "action_rejected", message: result },
          revision: snapshot.revision,
          states: snapshot.states,
          actions: snapshot.actions
        });
      } else {
        sendBridge("invokeActionResult", envelope.requestId, snapshot);
      }
      return;
    }

    if (envelope.type === "waitForChange") {
      const result = await waitForChange(envelope.payload);
      if (!result.ok) {
        sendBridge("waitForChangeResult", envelope.requestId, { error: result.error });
        return;
      }
      const snap = result.snapshot;
      const payload = snap
        ? { timedOut: result.timedOut, revision: snap.revision, states: snap.states, actions: snap.actions }
        : { timedOut: result.timedOut };
      sendBridge("waitForChangeResult", envelope.requestId, payload);
    }
  };

  const connect = (): void => {
    if (disposed) {
      return;
    }

    const hmr = providedHmrClient ?? getHmrClient();
    if (hmr) {
      const onMessage = (raw: unknown) => {
        try {
          const wrapped = isRecord(raw) && "envelope" in raw
            ? raw as { readonly envelope: unknown; readonly toHostId?: unknown }
            : null;

          if (wrapped && typeof wrapped.toHostId === "string" && wrapped.toHostId !== hostId) {
            return;
          }

          const validated = validateBridgeEnvelope(wrapped ? wrapped.envelope : raw);
          if (!validated.ok) {
            return;
          }

          const envelope = validated.value;
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
      hmr.on(runeDevBridgeEventName, onMessage);
      sendHmr(hmr, "registerHost", `register-${nextRequestId}`, { hostId });
      nextRequestId += 1;
      return;
    }

    const next = createSocket(wsPath);
    socket = next;

    next.addEventListener("open", () => {
      if (disposed) {
        next.close();
        return;
      }
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
        const messageEvent = event as { readonly data?: unknown };
        const parsed = typeof messageEvent?.data === "string"
          ? JSON.parse(messageEvent.data)
          : messageEvent?.data;
        const validated = validateBridgeEnvelope(parsed);
        if (!validated.ok) {
          return;
        }

        const envelope = validated.value;
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
    getStatus: () => status,
    stop: () => {
      disposed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      waitListeners.forEach((listener) => clearTimeout(listener.timer));
      waitListeners = [];
      if (socket) {
        if (socket.readyState !== socket.OPEN) {
          socket = null;
        } else {
          socket.close();
          socket = null;
        }
      }
      if (hmrClient && hmrListener && typeof hmrClient.off === "function") {
        hmrClient.off(runeDevBridgeEventName, hmrListener);
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
