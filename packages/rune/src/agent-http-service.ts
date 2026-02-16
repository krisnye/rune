import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Observe } from "@adobe/data/observe";
import { DynamicService } from "@adobe/data/service";
import { type Schema, validate } from "@adobe/data/schema";

const reservedWaitAction = "wait";
const defaultHost = "127.0.0.1";
const defaultPort = 3001;
const defaultBasePath = "/";
const defaultMaxWaitMs = 30_000;
const defaultUiPath = "/ui";

export interface CreateAgentHttpServiceArgs {
  readonly service: DynamicService.DynamicService;
  readonly host?: string;
  readonly port?: number;
  readonly basePath?: string;
  readonly maxWaitMs?: number;
  readonly enableUi?: boolean;
  readonly uiPath?: string;
}

export interface AgentHttpServiceInfo {
  readonly host: string;
  readonly port: number;
  readonly basePath: string;
  readonly origin: string;
  readonly url: string;
}

export interface StartAgentHttpServiceResult {
  readonly info: AgentHttpServiceInfo;
}

export interface AgentActionDescriptor {
  readonly schema: Schema | false;
  readonly method: "POST";
  readonly href: string;
  readonly meta?: true;
}

export interface AgentSnapshot {
  readonly revision: number;
  readonly states: Record<string, { readonly schema: Schema; readonly value: unknown }>;
  readonly actions: Record<string, AgentActionDescriptor>;
}

export interface AgentHttpService {
  readonly info: AgentHttpServiceInfo;
  readonly isRunning: () => boolean;
  readonly start: () => Promise<StartAgentHttpServiceResult>;
  readonly stop: () => Promise<void>;
  readonly dispose: () => Promise<void>;
  readonly getNodeServer: () => Server | null;
}

type WaitRequest = {
  readonly since?: number;
  readonly timeoutMs: number;
};

type Waiter = {
  readonly since: number;
  readonly resolve: (timedOut: boolean) => void;
  readonly timer: NodeJS.Timeout;
};

const normalizeBasePath = (basePath: string): string => {
  const trimmed = basePath.trim();
  if (trimmed === "" || trimmed === "/") {
    return "/";
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
};

const normalizeUiPath = (uiPath: string): string => {
  const trimmed = uiPath.trim();
  if (trimmed === "" || trimmed === "/") {
    return defaultUiPath;
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
};

const toServiceInfo = ({
  host,
  port,
  basePath
}: {
  readonly host: string;
  readonly port: number;
  readonly basePath: string;
}): AgentHttpServiceInfo => {
  const origin = `http://${host}:${port}`;
  const url = `${origin}${basePath === "/" ? "/" : `${basePath}/`}`;
  return { host, port, basePath, origin, url };
};

const json = (response: ServerResponse, statusCode: number, payload: unknown): void => {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
};

const parseBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (body === "") {
    return undefined;
  }
  return JSON.parse(body);
};

const parseWaitRequest = (input: unknown, maxWaitMs: number): WaitRequest | null => {
  if (input === undefined) {
    return { timeoutMs: maxWaitMs };
  }

  if (typeof input !== "object" || input === null) {
    return null;
  }

  const maybeSince = (input as Record<string, unknown>).since;
  const maybeTimeoutMs = (input as Record<string, unknown>).timeoutMs;
  if (maybeSince !== undefined && (!Number.isInteger(maybeSince) || Number(maybeSince) < 0)) {
    return null;
  }

  const timeoutMs = Number.isFinite(maybeTimeoutMs)
    ? Math.max(0, Math.min(Number(maybeTimeoutMs), maxWaitMs))
    : maxWaitMs;
  return {
    since: maybeSince === undefined ? undefined : Number(maybeSince),
    timeoutMs
  };
};

export const createAgentHttpService = ({
  service,
  host = defaultHost,
  port = defaultPort,
  basePath = defaultBasePath,
  maxWaitMs = defaultMaxWaitMs,
  enableUi = false,
  uiPath = defaultUiPath
}: CreateAgentHttpServiceArgs): AgentHttpService => {
  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedUiPath = normalizeUiPath(uiPath);
  const actionsBasePath = normalizedBasePath === "/" ? "/actions/" : `${normalizedBasePath}/actions/`;

  let revision = 0;
  let currentStates: Record<string, { readonly schema: Schema; readonly value: unknown }> = {};
  let currentServiceActions: Record<string, { readonly schema: Schema | false; readonly execute: (input?: unknown) => Promise<void | string> }> = {};
  let currentSnapshot: AgentSnapshot | null = null;
  let running = false;
  let stopped = false;
  let startedServer: Server | null = null;
  let waiters: Waiter[] = [];
  let resolvedReady = false;
  let readyResolve: (() => void) | null = null;
  const readyPromise = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });

  let info = toServiceInfo({ host, port, basePath: normalizedBasePath });

  const buildActions = (): Record<string, AgentActionDescriptor> => {
    const described = Object.fromEntries(
      Object.entries(currentServiceActions).map(([actionName, action]) => [
        actionName,
        {
          schema: action.schema,
          method: "POST" as const,
          href: `${actionsBasePath}${encodeURIComponent(actionName)}`
        }
      ])
    );

    return {
      ...described,
      [reservedWaitAction]: {
        schema: {
          type: "object",
          properties: {
            since: { type: "integer", minimum: 0 },
            timeoutMs: { type: "integer", minimum: 0, maximum: maxWaitMs }
          },
          additionalProperties: false
        },
        method: "POST",
        href: `${actionsBasePath}${reservedWaitAction}`,
        meta: true
      }
    };
  };

  const resolveWaiters = (timedOut: boolean): void => {
    const pending = waiters;
    waiters = [];
    pending.forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.resolve(timedOut);
    });
  };

  const resolveChangedWaiters = (): void => {
    const pending: Waiter[] = [];
    waiters.forEach((waiter) => {
      if (waiter.since === revision) {
        pending.push(waiter);
        return;
      }
      clearTimeout(waiter.timer);
      waiter.resolve(false);
    });
    waiters = pending;
  };

  const unobserve = Observe.fromProperties({
    states: service.states,
    actions: service.actions
  })(({ states, actions }) => {
    revision += 1;
    currentStates = states as Record<string, { readonly schema: Schema; readonly value: unknown }>;
    currentServiceActions = actions as Record<string, { readonly schema: Schema | false; readonly execute: (input?: unknown) => Promise<void | string> }>;
    currentSnapshot = {
      revision,
      states: currentStates,
      actions: buildActions()
    };
    if (!resolvedReady) {
      resolvedReady = true;
      readyResolve?.();
    }
    resolveChangedWaiters();
  });

  const ensureReady = async (): Promise<void> => {
    if (resolvedReady) {
      return;
    }
    await readyPromise;
  };

  const isRootPath = (pathname: string): boolean => pathname === normalizedBasePath || (normalizedBasePath !== "/" && pathname === `${normalizedBasePath}/`);

  const createWaitPromise = ({ since, timeoutMs }: { readonly since: number; readonly timeoutMs: number }): Promise<boolean> => {
    if (since !== revision) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiters = waiters.filter((waiter) => waiter.timer !== timer);
        resolve(true);
      }, timeoutMs);

      waiters.push({
        since,
        timer,
        resolve
      });
    });
  };

  const handleRootGet = async (response: ServerResponse): Promise<void> => {
    await ensureReady();
    json(response, 200, {
      ok: true,
      snapshot: currentSnapshot
    });
  };

  const handleUiGet = async (response: ServerResponse): Promise<void> => {
    if (!enableUi) {
      json(response, 404, { ok: false, error: { code: "not_found", message: "Route not found" } });
      return;
    }

    const { renderAgentUiHtml } = await import("./ui/render-agent-ui-html.js");
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(renderAgentUiHtml({
      apiBasePath: normalizedBasePath,
      title: "Rune Agent UI"
    }));
  };

  const handleWait = async (response: ServerResponse, input: unknown): Promise<void> => {
    await ensureReady();
    const parsed = parseWaitRequest(input, maxWaitMs);
    if (!parsed) {
      json(response, 400, {
        ok: false,
        error: {
          code: "invalid_wait_input",
          message: "wait accepts optional { since?: integer, timeoutMs?: integer }"
        }
      });
      return;
    }

    const effectiveWait: { readonly since: number; readonly timeoutMs: number } = {
      since: parsed.since ?? revision,
      timeoutMs: parsed.timeoutMs
    };

    const timedOut = await createWaitPromise(effectiveWait);

    json(response, 200, {
      ok: true,
      timedOut,
      snapshot: currentSnapshot
    });
  };

  const handleActionPost = async (response: ServerResponse, actionName: string, input: unknown): Promise<void> => {
    await ensureReady();
    if (actionName === reservedWaitAction) {
      await handleWait(response, input);
      return;
    }

    const action = currentServiceActions[actionName];
    if (!action) {
      json(response, 409, {
        ok: false,
        error: {
          code: "action_unavailable",
          message: `Action "${actionName}" is not currently available`
        },
        snapshot: currentSnapshot
      });
      return;
    }

    if (action.schema !== false) {
      const errors = validate(action.schema, input);
      if (errors.length > 0) {
        json(response, 400, {
          ok: false,
          error: {
            code: "invalid_action_input",
            message: "Action input failed schema validation",
            details: errors
          },
          snapshot: currentSnapshot
        });
        return;
      }
    }

    const result = await service.execute(actionName, input);
    if (typeof result === "string") {
      json(response, 409, {
        ok: false,
        error: {
          code: "action_rejected",
          message: result
        },
        snapshot: currentSnapshot
      });
      return;
    }

    json(response, 200, {
      ok: true,
      snapshot: currentSnapshot
    });
  };

  const requestHandler = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", info.origin);
      const pathname = url.pathname;

      if (method === "GET" && isRootPath(pathname)) {
        await handleRootGet(response);
        return;
      }

      if (method === "GET" && pathname === normalizedUiPath) {
        await handleUiGet(response);
        return;
      }

      if (method === "POST" && pathname.startsWith(actionsBasePath)) {
        const actionName = decodeURIComponent(pathname.slice(actionsBasePath.length));
        if (!actionName) {
          json(response, 404, { ok: false, error: { code: "not_found", message: "Missing action name" } });
          return;
        }
        const input = await parseBody(request);
        await handleActionPost(response, actionName, input);
        return;
      }

      json(response, 404, { ok: false, error: { code: "not_found", message: "Route not found" } });
    } catch (error) {
      json(response, 500, {
        ok: false,
        error: {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error"
        }
      });
    }
  };

  const isRunning = (): boolean => running;

  const start = async (): Promise<StartAgentHttpServiceResult> => {
    if (running) {
      return { info };
    }
    if (stopped) {
      throw new Error("Service has been disposed");
    }

    startedServer = createServer((request, response) => {
      void requestHandler(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      startedServer?.once("error", reject);
      startedServer?.listen(port, host, () => {
        startedServer?.off("error", reject);
        resolve();
      });
    });

    const address = startedServer.address();
    const resolvedPort = typeof address === "object" && address ? address.port : port;
    info = toServiceInfo({ host, port: resolvedPort, basePath: normalizedBasePath });
    running = true;
    return { info };
  };

  const stop = async (): Promise<void> => {
    if (!running || !startedServer) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      startedServer?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    running = false;
    startedServer = null;
  };

  const dispose = async (): Promise<void> => {
    await stop();
    resolveWaiters(true);
    unobserve();
    stopped = true;
  };

  return {
    get info() {
      return info;
    },
    isRunning,
    start,
    stop,
    dispose,
    getNodeServer: () => startedServer
  };
};
