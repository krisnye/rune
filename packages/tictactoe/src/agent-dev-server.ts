type CacheStore = Map<string, Response>;

const requestToKey = async (input: RequestInfo | URL, init?: RequestInit): Promise<string> => {
  const request = input instanceof Request ? input : new Request(input, init);
  const body = request.method === "GET" || request.method === "HEAD"
    ? ""
    : await request.clone().text();
  return JSON.stringify({
    method: request.method,
    url: request.url,
    body
  });
};

const createMemoryCache = (): Cache => {
  const store: CacheStore = new Map();

  return {
    add: async (_request: RequestInfo | URL): Promise<void> => {},
    addAll: async (_requests: RequestInfo[]): Promise<void> => {},
    delete: async (request: RequestInfo | URL, options?: CacheQueryOptions): Promise<boolean> => {
      const key = await requestToKey(request, options as RequestInit | undefined);
      return store.delete(key);
    },
    keys: async (): Promise<readonly Request[]> => [],
    match: async (request: RequestInfo | URL, options?: CacheQueryOptions): Promise<Response | undefined> => {
      const key = await requestToKey(request, options as RequestInit | undefined);
      const response = store.get(key);
      return response ? response.clone() : undefined;
    },
    matchAll: async (): Promise<readonly Response[]> => [],
    put: async (request: RequestInfo | URL, response: Response): Promise<void> => {
      const key = await requestToKey(request);
      store.set(key, response.clone());
    }
  };
};

const installCachesPolyfill = (): void => {
  if (typeof globalThis.caches !== "undefined") {
    return;
  }

  const cachesByName = new Map<string, Cache>();
  const cachesPolyfill: CacheStorage = {
    delete: async (cacheName: string): Promise<boolean> => cachesByName.delete(cacheName),
    has: async (cacheName: string): Promise<boolean> => cachesByName.has(cacheName),
    keys: async (): Promise<string[]> => [...cachesByName.keys()],
    match: async (request: RequestInfo | URL, options?: MultiCacheQueryOptions): Promise<Response | undefined> => {
      const entries = [...cachesByName.values()];
      for (const cache of entries) {
        const response = await cache.match(request, options);
        if (response) {
          return response;
        }
      }
      return undefined;
    },
    open: async (cacheName: string): Promise<Cache> => {
      const existing = cachesByName.get(cacheName);
      if (existing) {
        return existing;
      }
      const next = createMemoryCache();
      cachesByName.set(cacheName, next);
      return next;
    }
  };

  (globalThis as { caches?: CacheStorage }).caches = cachesPolyfill;
};

installCachesPolyfill();

const runeServerPort = 4000;
const { Database } = await import("@adobe/data/ecs");
const { createAgentHttpService } = await import("@paralleldrive/rune");
const { agentPlugin } = await import("./plugins/agent-plugin.js");

const db = Database.create(agentPlugin);
const agentHttpService = createAgentHttpService({
  service: db.services.agent,
  port: runeServerPort,
  enableUi: true
});

try {
  const { info } = await agentHttpService.start();
  console.log(`Rune agent server listening on ${info.url}`);
} catch (error: unknown) {
  console.error("Failed to start rune agent server", error);
}

console.log("TicTacToe agent database initialized.");
console.log("Rune agent server is expected at http://127.0.0.1:4000/");
console.log("Optional HTML UI is expected at http://127.0.0.1:4000/ui");

// Keep a reference alive for process lifetime.
void db;

export {};
