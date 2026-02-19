import { createBridgeEnvelope, validateBridgeEnvelope } from "./dev-bridge-protocol.js";

export const runeDevBridgeWsPath = "/__rune_bridge_ws";
export const runeDevBridgeHostStatusPath = "/__rune_bridge_host";
export const runeDevBridgeApiPath = "/__rune_bridge";
export const runeDevBridgeEventName = "rune-dev-bridge:event";

type BridgeSocket = {
  readonly send: (data: string) => void;
  readonly on: (event: "message" | "close", handler: (payload?: unknown) => void) => void;
};

type BridgeHmrClient = {
  readonly send: (event: string, payload?: unknown) => void;
};

export interface BridgeHostStatus {
  readonly connected: boolean;
  readonly hostId: string | null;
}

export interface BridgeHostRegistry {
  readonly getStatus: () => BridgeHostStatus;
  readonly getHost: () => { readonly hostId: string; readonly transportId: unknown; readonly send: (payload: unknown) => void } | null;
  readonly registerHost: (hostId: string, transport: { readonly id: unknown; readonly send: (payload: unknown) => void }) => { readonly accepted: boolean; readonly reason?: string };
  readonly disconnectTransport: (transportId: unknown) => void;
}

export interface RuneDevBridgeVitePluginConfig {
  readonly wsPath?: string;
  readonly hostStatusPath?: string;
  readonly apiPath?: string;
  readonly relayTimeoutMs?: number;
}

const sendEnvelope = (socket: BridgeSocket, payload: unknown): void => {
  socket.send(JSON.stringify(payload));
};

const parseMessage = (payload: unknown): unknown => {
  if (typeof payload === "string") {
    return JSON.parse(payload);
  }
  if (payload instanceof Buffer) {
    return JSON.parse(payload.toString("utf8"));
  }
  if (Array.isArray(payload)) {
    return JSON.parse(Buffer.concat(payload as Buffer[]).toString("utf8"));
  }
  return payload;
};

export const createBridgeHostRegistry = (): BridgeHostRegistry => {
  let currentHost: { readonly hostId: string; readonly transportId: unknown; readonly send: (payload: unknown) => void } | null = null;

  return {
    getStatus: () => ({
      connected: currentHost !== null,
      hostId: currentHost?.hostId ?? null
    }),
    getHost: () => currentHost,
    registerHost: (hostId, transport) => {
      if (currentHost === null) {
        currentHost = { hostId, transportId: transport.id, send: transport.send };
        return { accepted: true };
      }

      currentHost = { hostId, transportId: transport.id, send: transport.send };
      return { accepted: true };
    },
    disconnectTransport: (transportId) => {
      if (currentHost?.transportId === transportId) {
        currentHost = null;
      }
    }
  };
};

const pathnameOf = (urlValue: string | undefined): string => {
  if (!urlValue) {
    return "";
  }
  try {
    return new URL(urlValue, "http://localhost").pathname;
  } catch {
    return "";
  }
};

const queryParam = (urlValue: string | undefined, name: string): string | undefined => {
  if (!urlValue) {
    return undefined;
  }
  try {
    return new URL(urlValue, "http://localhost").searchParams.get(name) ?? undefined;
  } catch {
    return undefined;
  }
};

const parseInputFromPostQuery = (postValue: string | undefined): unknown => {
  if (postValue === undefined || postValue === "") {
    return undefined;
  }
  try {
    return JSON.parse(postValue);
  } catch {
    return postValue;
  }
};

const sendJson = (
  response: {
    writeHead: (statusCode: number, headers: Record<string, string>) => void;
    end: (body?: string) => void;
  },
  statusCode: number,
  payload: unknown
): void => {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
};

const invalidJsonErrorCode = "invalid_json" as const;

const parseBody = async (request: unknown): Promise<unknown> => {
  if (!request || typeof request !== "object" || !(Symbol.asyncIterator in request)) {
    return undefined;
  }

  const chunks: Buffer[] = [];
  try {
    for await (const chunk of request as AsyncIterable<unknown>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
  } catch (err) {
    throw { code: invalidJsonErrorCode, message: "Failed to read request body", cause: err };
  }

  if (chunks.length === 0) {
    return undefined;
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text === "") {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    const message = err instanceof SyntaxError ? err.message : "Invalid JSON in request body";
    throw { code: invalidJsonErrorCode, message, cause: err };
  }
};

export const createRuneDevBridgeVitePlugin = ({
  wsPath = runeDevBridgeWsPath,
  hostStatusPath = runeDevBridgeHostStatusPath,
  apiPath = runeDevBridgeApiPath,
  relayTimeoutMs = 10_000
}: RuneDevBridgeVitePluginConfig = {}) => {
  const registry = createBridgeHostRegistry();
  const actionsPrefix = `${apiPath}/actions/`;
  let nextRelayRequestId = 1;
  const pendingRelayRequests = new Map<
    string,
    {
      readonly hostId: string;
      readonly resolve: (value: unknown) => void;
      readonly reject: (error: unknown) => void;
      readonly timeout: NodeJS.Timeout;
    }
  >();

  const clearPendingBySocket = (socket: BridgeSocket): void => {
    for (const [requestId, pending] of pendingRelayRequests.entries()) {
      if (registry.getHost()?.transportId !== socket || registry.getHost()?.hostId !== pending.hostId) {
        continue;
      }
      clearTimeout(pending.timeout);
      pending.reject({
        code: "host_disconnected",
        message: "Active host disconnected while request was in flight"
      });
      pendingRelayRequests.delete(requestId);
    }
  };

  const clearPendingByTransportId = (transportId: unknown): void => {
    for (const [requestId, pending] of pendingRelayRequests.entries()) {
      if (registry.getHost()?.transportId !== transportId || registry.getHost()?.hostId !== pending.hostId) {
        continue;
      }
      clearTimeout(pending.timeout);
      pending.reject({
        code: "host_disconnected",
        message: "Active host disconnected while request was in flight"
      });
      pendingRelayRequests.delete(requestId);
    }
  };

  const relayToHost = async (
    {
      type,
      payload
    }: {
      readonly type: string;
      readonly payload?: unknown;
    },
    overrideTimeoutMs?: number
  ): Promise<unknown> => {
    const host = registry.getHost();
    if (!host) {
      throw {
        code: "host_unavailable",
        message: "No browser host is currently connected"
      };
    }

    const requestId = `relay-${nextRelayRequestId}`;
    nextRelayRequestId += 1;
    const effectiveTimeoutMs = overrideTimeoutMs ?? relayTimeoutMs;

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRelayRequests.delete(requestId);
        reject({
          code: "relay_timeout",
          message: `Timed out waiting for host response after ${effectiveTimeoutMs}ms`
        });
      }, effectiveTimeoutMs);

      pendingRelayRequests.set(requestId, { hostId: host.hostId, resolve, reject, timeout });
      host.send(createBridgeEnvelope({ requestId, type, payload }));
    });
  };

  return {
    name: "rune-dev-bridge",
    configureServer(server: {
      readonly ws: {
        readonly on: (event: string, handler: (...args: any[]) => void) => void;
        readonly send?: (event: string, payload?: unknown) => void;
      };
      readonly middlewares: {
        readonly use: (handler: (request: { readonly url?: string; readonly method?: string }, response: {
          writeHead: (statusCode: number, headers: Record<string, string>) => void;
          end: (body?: string) => void;
        }, next: () => void) => void) => void;
      };
    }) {
      server.middlewares.use((request, response, next) => {
        void (async () => {
          const pathname = pathnameOf(request.url);

          if (request.method === "GET" && pathname === hostStatusPath) {
            sendJson(response, 200, { ok: true, host: registry.getStatus() });
            return;
          }

          if (request.method === "GET" && pathname === apiPath) {
            try {
              const payload = await relayToHost({ type: "getSnapshot" });
              sendJson(response, 200, payload);
            } catch (error) {
              sendJson(response, 503, {
                ok: false,
                error: {
                  code: "bridge_unavailable",
                  message: "Unable to relay request to browser host",
                  details: error
                }
              });
            }
            return;
          }

          if (pathname.startsWith(actionsPrefix)) {
            const actionName = decodeURIComponent(pathname.slice(actionsPrefix.length));
            if (!actionName) {
              sendJson(response, 404, { ok: false, error: { code: "not_found", message: "Missing action name" } });
              return;
            }

            let input: unknown;
            try {
              if (request.method === "GET") {
                const postValue = queryParam(request.url, "post");
                if (postValue === undefined) {
                  sendJson(response, 405, { ok: false, error: { code: "method_not_allowed", message: "Use POST or GET with ?post or ?post=<value> to invoke actions" } });
                  return;
                }
                input = parseInputFromPostQuery(postValue);
              } else if (request.method === "POST") {
                input = await parseBody(request);
              } else {
                sendJson(response, 405, { ok: false, error: { code: "method_not_allowed", message: "Use POST or GET with ?post or ?post=<value>" } });
                return;
              }
            } catch (bodyError: unknown) {
              const err = bodyError as { code?: string; message?: string };
              if (err?.code === invalidJsonErrorCode) {
                sendJson(response, 400, {
                  ok: false,
                  error: { code: "invalid_json", message: err.message ?? "Invalid JSON in request body" }
                });
                return;
              }
              throw bodyError;
            }

            try {
              // For wait, use a relay timeout at least as long as the requested wait so the host
              // can respond with { timedOut, revision, states, actions } when no change occurs.
              const waitRequestTimeoutMs =
                actionName === "wait" &&
                input !== undefined &&
                typeof input === "object" &&
                input !== null &&
                "timeoutMs" in input
                  ? Math.max(0, Number((input as { timeoutMs?: unknown }).timeoutMs))
                  : 0;
              const relayTimeoutForWait =
                Number.isFinite(waitRequestTimeoutMs) && waitRequestTimeoutMs > 0
                  ? Math.max(relayTimeoutMs, waitRequestTimeoutMs + 2000)
                  : undefined;

              const payload =
                actionName === "wait"
                  ? await relayToHost(
                      { type: "waitForChange", payload: input },
                      relayTimeoutForWait
                    )
                  : await relayToHost({
                      type: "invokeAction",
                      payload: {
                        actionName,
                        input
                      }
                    });

              sendJson(response, 200, payload);
            } catch (error) {
              sendJson(response, 503, {
                ok: false,
                error: {
                  code: "bridge_unavailable",
                  message: "Unable to relay request to browser host",
                  details: error
                }
              });
            }
            return;
          }

          next();
        })();
      });

      server.ws.on("connection", (socket, request) => {
        const pathname = pathnameOf(request.url);
        const isBridgePath = pathname === wsPath;

        const processBridgeEnvelope = (rawEnvelope: unknown): void => {
          try {
            const parsed = parseMessage(rawEnvelope);
            // Vite HMR sends custom events as { type: "custom", event: runeDevBridgeEventName, data: envelope }
            // over the same WebSocket; unwrap so we validate the inner envelope.
            const isHmrCustom =
              typeof parsed === "object" &&
              parsed !== null &&
              "type" in (parsed as object) &&
              (parsed as { type: unknown }).type === "custom" &&
              "event" in (parsed as object) &&
              (parsed as { event: unknown }).event === runeDevBridgeEventName &&
              "data" in (parsed as object);
            const envelopePayload = isHmrCustom
              ? (parsed as { data: unknown }).data
              : parsed;
            const validated = validateBridgeEnvelope(envelopePayload);

            if (!validated.ok) {
              return;
            }

            const envelope = validated.value;
            // When the message came via HMR custom event, responses must be wrapped so the client's
            // hmr.on(event, cb) is invoked (Vite only dispatches when type === "custom").
            const sendResponse = (responseEnvelope: ReturnType<typeof createBridgeEnvelope>): void => {
              if (isHmrCustom) {
                sendEnvelope(socket, {
                  type: "custom",
                  event: runeDevBridgeEventName,
                  data: responseEnvelope
                });
              } else {
                sendEnvelope(socket, responseEnvelope);
              }
            };
            const envelopeHostId = typeof envelope.extensions?.hostId === "string"
              ? envelope.extensions.hostId
              : undefined;
            const pending = pendingRelayRequests.get(envelope.requestId);
            if (pending) {
              if (envelopeHostId === undefined || envelopeHostId === pending.hostId) {
                clearTimeout(pending.timeout);
                pending.resolve(envelope.payload);
                pendingRelayRequests.delete(envelope.requestId);
              }
              return;
            }

            // Process registerHost from dedicated bridge path or from HMR custom event (same socket).
            if (!isBridgePath && !isHmrCustom) {
              return;
            }

            if (envelope.type !== "registerHost") {
              sendResponse(createBridgeEnvelope({
                requestId: envelope.requestId,
                type: "error",
                payload: {
                  code: "unsupported_message_type",
                  message: `Unsupported message type: ${envelope.type}`
                }
              }));
              return;
            }

            const hostId = typeof envelope.payload === "object" && envelope.payload !== null && "hostId" in envelope.payload
              ? String((envelope.payload as { hostId: unknown }).hostId)
              : "";

            if (hostId.trim() === "") {
              sendResponse(createBridgeEnvelope({
                requestId: envelope.requestId,
                type: "registerHostResult",
                payload: {
                  accepted: false,
                  reason: "invalid_host_id"
                }
              }));
              return;
            }

            // Transport for this host: when relaying (getSnapshot, invokeAction, etc.), we must send
            // in HMR custom format if the host registered via HMR so the client's hmr.on() receives it.
            const transport = {
              id: socket,
              send: (payload: unknown): void => {
                if (isHmrCustom) {
                  sendEnvelope(socket, {
                    type: "custom",
                    event: runeDevBridgeEventName,
                    data: payload
                  });
                } else {
                  sendEnvelope(socket, payload);
                }
              }
            };
            const registration = registry.registerHost(hostId, transport);
            sendResponse(createBridgeEnvelope({
              requestId: envelope.requestId,
              type: "registerHostResult",
              payload: {
                accepted: registration.accepted,
                reason: registration.reason,
                activeHostId: registry.getStatus().hostId
              }
            }));
          } catch (error) {
            sendEnvelope(socket, createBridgeEnvelope({
              requestId: "unknown",
              type: "error",
              payload: {
                code: "invalid_message",
                message: error instanceof Error ? error.message : "Invalid message payload"
              }
            }));
          }
        };

        socket.on("message", (raw: unknown) => {
          processBridgeEnvelope(raw);
        });

        socket.on("close", () => {
          clearPendingBySocket(socket);
          registry.disconnectTransport(socket);
        });
      });

      server.ws.on(runeDevBridgeEventName, (payload: unknown, client: BridgeHmrClient) => {
        const transport = {
          id: client,
          send: (envelopePayload: unknown) => {
            if (typeof server.ws.send === "function") {
              server.ws.send(runeDevBridgeEventName, {
                toHostId: registry.getHost()?.hostId ?? null,
                envelope: envelopePayload
              });
              return;
            }
            client.send(runeDevBridgeEventName, envelopePayload);
          }
        };

        try {
          const validated = validateBridgeEnvelope(payload);
          if (!validated.ok) {
            return;
          }
          const envelope = validated.value;
          const envelopeHostId = typeof envelope.extensions?.hostId === "string"
            ? envelope.extensions.hostId
            : undefined;
          const pending = pendingRelayRequests.get(envelope.requestId);
          if (pending) {
            if (envelopeHostId === undefined || envelopeHostId === pending.hostId) {
              clearTimeout(pending.timeout);
              pending.resolve(envelope.payload);
              pendingRelayRequests.delete(envelope.requestId);
            }
            return;
          }

          if (envelope.type !== "registerHost") {
            transport.send(createBridgeEnvelope({
              requestId: envelope.requestId,
              type: "error",
              payload: {
                code: "unsupported_message_type",
                message: `Unsupported message type: ${envelope.type}`
              }
            }));
            return;
          }

          const hostId = typeof envelope.payload === "object" && envelope.payload !== null && "hostId" in envelope.payload
            ? String((envelope.payload as { hostId: unknown }).hostId)
            : "";

          if (hostId.trim() === "") {
            transport.send(createBridgeEnvelope({
              requestId: envelope.requestId,
              type: "registerHostResult",
              payload: {
                accepted: false,
                reason: "invalid_host_id"
              }
            }));
            return;
          }

          const registration = registry.registerHost(hostId, {
            id: client,
            send: (envelopePayload: unknown) => {
              if (typeof server.ws.send === "function") {
                server.ws.send(runeDevBridgeEventName, {
                  toHostId: hostId,
                  envelope: envelopePayload
                });
                return;
              }
              client.send(runeDevBridgeEventName, envelopePayload);
            }
          });
          transport.send(createBridgeEnvelope({
            requestId: envelope.requestId,
            type: "registerHostResult",
            payload: {
              accepted: registration.accepted,
              reason: registration.reason,
              activeHostId: registry.getStatus().hostId
            }
          }));
        } catch {
          clearPendingByTransportId(client);
          registry.disconnectTransport(client);
        }
      });
    }
  };
};
