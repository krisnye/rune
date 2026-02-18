# Refactor Plan: @adobe/data 0.9.23 AgenticService Migration

## Context

- Upgraded `@adobe/data` from 0.9.22 → 0.9.23.
- `DynamicService` has been replaced by `AgenticService` with a new API:
  - **Declaration vs implementation separation**: schemas live in `declaration`, values/executes in `implementation`.
  - **Merged state/action map**: discriminated by presence of `type` (state) vs `description` + optional `input` (action).
  - **No more state/action helpers**: `AgenticService.state()` and `AgenticService.action()` removed; use `AgenticService.create({ declaration, implementation, conditional? })`.

---

## API Mapping (Quick Reference)

| Old (DynamicService) | New (AgenticService) |
|----------------------|----------------------|
| `DynamicService.create({ states, actions })` | `AgenticService.create({ description, declaration, implementation, conditional? })` |
| State: `DynamicService.state({ schema, value, enabled? })` | Declaration: `{ type: "string" \| "number" \| "object" \| …, description }`<br>Implementation: `Observe<value>`<br>Conditional: `Observe<boolean>` (optional) |
| Action: `DynamicService.action({ description, schema, enabled, execute })` | Declaration: `{ description, input?: Schema }` (no top-level `type`)<br>Implementation: `(input?) => Promise<void \| string>`<br>Conditional: `Observe<boolean>` (optional) |

---

## Phase 1: Rune Package — Type Rename (Low Risk)

**Files:**  
`rune-dev-bridge-client-types.ts`, `rune-dev-bridge-react.ts`, `rune-dev-bridge-browser-runtime.ts`, `agent-http-service.ts`

**Changes:**
- Replace `DynamicService` with `AgenticService` in imports and type annotations.
- Replace `DynamicService.DynamicService` with `AgenticService`.
- No behavioral changes; the service shape (`states`, `actions`, `execute`) is unchanged.

**Acceptance:** `pnpm --filter @paralleldrive/rune run typecheck` and `pnpm --filter @paralleldrive/rune run test` pass.

---

## Phase 2: Rune Tests — Mock Update (Low Risk)

**File:** `packages/rune/test/agent-http-service.test.mjs`

**Changes:**
- Rename `createMockDynamicService` → `createMockAgenticService` (or keep name, update `serviceName`).
- Set `serviceName: "agentic-service"` in the mock (was `"dynamic-service"`).
- No other changes; mock shape matches AgenticService.

**Acceptance:** `pnpm --filter @paralleldrive/rune run test` passes.

---

## Phase 3: Tictactoe Agent Plugin — New Declaration/Implementation Shape (Core Refactor)

**File:** `packages/tictactoe/src/plugins/agent-plugin.ts`

**Current structure (DynamicService):**
- States: `yourMark`, `opponentMark`, `board`, `currentPlayer` (with `enabled` on `currentPlayer`).
- Actions: `resetGame` (enabled when `isGameOver`), `playMove` (enabled when `!isGameOver && currentPlayer === agentMark`).

**New structure (AgenticService):**

```ts
AgenticService.create({
  description: "TicTacToe agent service",
  declaration: {
    yourMark: { type: "string", description: "Agent mark" },
    opponentMark: { type: "string", description: "Opponent mark" },
    board: { type: "string", description: "Board state" },  // BoardState.schema
    currentPlayer: { type: "string", description: "Current player" },
    resetGame: { description: "Reset the game after completion" },
    playMove: { description: "Play an O move on the board", input: { type: "integer", minimum: 0, maximum: 8 } },
  },
  implementation: {
    yourMark: Observe.fromConstant(agentMark),
    opponentMark: Observe.fromConstant(opponentMark),
    board,
    currentPlayer,
    resetGame: async () => { db.transactions.restartGame(); },
    playMove: async (index: number) => { db.transactions.playMove({ index }); },
  },
  conditional: {
    currentPlayer: Observe.withMap(isGameOver, (g) => !g),
    resetGame: isGameOver,
    playMove: Observe.withFilter(
      Observe.fromProperties({ isGameOver, currentPlayer }),
      ({ isGameOver, currentPlayer }) => !isGameOver && currentPlayer === agentMark
    ),
  },
})
```

**Schema notes:** State declarations require `type` (e.g. `"string"`, `"number"`). For `PlayerMark` (enum), use `{ type: "string", enum: ["X","O"], description: "..." }`. For `board`, use `{ ...BoardState.schema, description: "..." }` (already has `type: "string"`).

**Acceptance:** `pnpm --filter tictactoe run typecheck` passes; dev bridge + agent HTTP work as before.

---

## Phase 4: Tictactoe Bridge Host — Type Update (Trivial)

**File:** `packages/tictactoe/src/rune-dev-bridge/rune-dev-bridge-host.tsx`

**Changes:**
- Replace `DynamicService` with `AgenticService` in import and type cast.

**Acceptance:** `pnpm --filter tictactoe run typecheck` passes.

---

## Phase 5: Full Verification

- `pnpm typecheck` (all packages)
- `pnpm --filter @paralleldrive/rune run test`
- `pnpm --filter tictactoe run test` (if applicable)
- Manual: `pnpm dev` → open app, verify bridge status, play a move, reset.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Schema shape mismatch in declaration | Align with `PlayerMark.schema` / `BoardState.schema` from existing types; validate via typecheck. |
| Conditional typing complexity | Use `Observe.withMap` / `Observe.withFilter` / `Observe.fromProperties` as in data tests. |
| @adobe/data-react 0.9.23 compatibility | Upgrade in lockstep; revert if API drift. |

---

## Suggested Execution Order

1. Phase 1 (rune type renames)
2. Phase 2 (rune test mock)
3. Phase 3 (agent plugin refactor)
4. Phase 4 (bridge host)
5. Phase 5 (verification)

---

# Rune Dev Bridge: Single Path, Vite Only

**Goal:** The only thing an app provides is its **AgenticService instance**. Everything else (Vite plugin, bridge host UI, transport, relay) lives in rune. One path only: **Vite dev server** — no separate Node agent server, no optional second path.

---

## Principle: Nothing App-Specific Except the Service

- **App provides:** A single `AgenticService` (e.g. `db.services.agent`). How the app gets that (plugin, context, prop) is the app’s concern; the bridge only needs to receive it.
- **Rune provides:** Vite plugin, browser host runtime, relay, status UI, protocol — all reusable. No app-specific bridge components, no app-owned server scripts, no polyfills in the app.

---

## How the Rune Dev Bridge Works (Vite-Only)

1. **Vite dev server** runs with `createRuneDevBridgeVitePlugin()`. It exposes:
   - `GET /__rune_bridge_host` — host status
   - `GET /__rune_bridge` — relay to browser host → snapshot
   - `POST /__rune_bridge/actions/<name>` — relay → invoke action or wait
   - WebSocket `/__rune_bridge_ws` and HMR event `rune-dev-bridge:event` — host registration and relay.

2. **Browser** loads the app. The app mounts a **single bridge surface** that receives the app’s AgenticService (and nothing else bridge-specific). That surface:
   - Passes the service to rune’s `activateRuneDevBridge` (or equivalent component that does so).
   - Rune registers the browser as the host with the Vite plugin and handles all relay/protocol.

3. **AI/client** talks to the app’s dev origin (e.g. `http://localhost:3002/__rune_bridge`). No separate Node process.

---

## Current Plan: Minimal Client Surface

| What | Where | App responsibility |
|------|--------|--------------------|
| Vite plugin | `vite.config.ts` | Add rune plugin (one line). |
| Bridge host | App tree (e.g. `App.tsx`) | One component that **only** passes `service={agenticService}` (or equivalent). No app-specific bridge logic. |
| AgenticService | App (plugin, DB, context) | App obtains its agent service and passes it into the bridge. |

**Out of scope for this plan:** Separate Node agent server (e.g. `agent-dev-server.ts`), caches polyfill, `/ui` server, or any “second path.” The dev bridge is **Vite dev server only**.

---

## Target Client Experience

1. **vite.config.ts** — Add rune plugin.
2. **App** — One place that passes the app’s AgenticService into rune’s bridge (e.g. `<RuneDevBridgeHost service={agenticService} />` or a rune export that takes only `service`). The app decides how it gets `agenticService` (e.g. from `useDatabase().services.agent` or a prop); rune does not depend on how the app stores or resolves it.
3. **Run** `vite` (or `pnpm dev`). AI uses `http://localhost:PORT/__rune_bridge`.

No app-specific bridge files, no agent-dev-server, no optional paths.

---

## Suggested Next Steps

1. **Rune** — Ensure the public API has a single entry for “mount bridge with this service” (component or hook) that takes only the AgenticService (and optional dev-only flags like `showStatus`). No plugin/DB in rune’s API; the app passes the service it already has.
2. **Tictactoe** — Reduce to: Vite plugin + one component that passes `service={db.services.agent}` (or equivalent). Remove or repurpose any app-specific bridge folder/file so the only app-specific piece is “where we get the service from.”
3. **Remove / deprecate** — Drop the separate Node agent server from the “easiest path” story; remove or relocate `agent-dev-server.ts` and its caches polyfill so new projects are not told to run a second process. Document that the dev bridge works with the Vite dev server only.
4. **Docs** — State clearly: one path (Vite), one obligation (pass your AgenticService), no double paths.

---

# Rune Dev Bridge: How It Works (Reference)

## End-to-end flow

1. **App** mounts a bridge surface (e.g. `<RuneDevBridgeReact service={db.services.agent} showStatus hmrClient={import.meta.hot} />`).
2. **React** calls `activateRuneDevBridge({ service, enabled, transport: { hmrClient }, debugUi, onStatusChange })`.
3. **activate-rune-dev-bridge.ts**:
   - If `!resolveEnabled(enabled)` → returns inert handle (no runtime, status stays default "Disconnected").
   - Otherwise dynamically imports `rune-dev-bridge-browser-runtime.js`, optionally mounts status element on `debugUi.host`, then calls `createRuneBrowserHostRuntime({ service, hmrClient, onStatusChange, ... })`.
4. **rune-dev-bridge-browser-runtime.ts** (`connect()`):
   - Prefers **HMR**: `hmr = providedHmrClient ?? getHmrClient()` (Vite: `import.meta.hot`). If present:
     - Registers `hmr.on(runeDevBridgeEventName, onMessage)`.
     - Sends `registerHost` via `hmr.send(runeDevBridgeEventName, createBridgeEnvelope({ type: "registerHost", payload: { hostId }, ... }))`.
     - Vite client serializes that as `{ type: "custom", event: "rune-dev-bridge:event", data: envelope }` and sends it over the **same WebSocket** used for HMR.
   - Fallback: if no HMR client, opens a dedicated WebSocket to `ws://origin/__rune_bridge_ws` and sends raw `registerHost` envelope on `open`.
5. **Vite dev server** (with `createRuneDevBridgeVitePlugin()`):
   - **Single WebSocket server** for HMR. Every client connection gets `server.ws.on("connection", (socket, request) => { ... socket.on("message", processBridgeEnvelope); ... })`.
   - When a message arrives on that socket:
     - **Connection handler**: `processBridgeEnvelope(raw)` runs. If `raw` is Vite custom shape `{ type: "custom", event: "rune-dev-bridge:event", data: envelope }`, the plugin unwraps `data` as the bridge envelope, validates it, and if it’s `registerHost` calls `registry.registerHost(hostId, transport)` and replies with `sendResponse(registerHostResult)`. For HMR, `sendResponse` wraps the reply as `{ type: "custom", event: runeDevBridgeEventName, data: responseEnvelope }` so the client’s `hmr.on(..., cb)` is invoked.
     - **Named handler**: `server.ws.on(runeDevBridgeEventName, (payload, client) => ...)` is invoked by Vite when it dispatches custom events (Vite passes `parsed.data` as `payload` and a client wrapper as `client`). So the same `registerHost` can be handled here too; response is sent via `server.ws.send(runeDevBridgeEventName, { toHostId, envelope })` (client receives wrapped `{ toHostId, envelope }`).
   - So the browser host can register via **either** the connection-handler path (raw socket message, HMR unwrap) **or** the named-handler path (Vite-dispatched custom event).
6. **Browser runtime** receives the response:
   - **HMR path**: Client’s HMR layer parses the WebSocket message, sees `type: "custom"`, calls `notifyListeners(event, data)`. So `onMessage` gets either the plain `registerHostResult` envelope (if server sent `{ type: "custom", event, data: envelope }`) or the wrapped `{ toHostId, envelope }` (if server used the named-handler send). The runtime’s `onMessage` handles both: if `raw` has `envelope`, it validates `wrapped.envelope`; else validates `raw`. On `registerHostResult` it calls `setStatus({ socketConnected: true, hostAccepted, hostId })`.
   - **WebSocket path**: `socket.addEventListener("message", ...)` gets the raw envelope and does the same status update.
7. **Status UI** (React or custom element) shows Connected / Host Active from `onStatusChange` / `getStatus()`.

## Protocol

- **Envelope**: `{ protocol: "rune-dev-bridge", version: 1, requestId, type, payload?, extensions? }`. Validated by `validateBridgeEnvelope`.
- **registerHost** (client → server): `type: "registerHost"`, `payload: { hostId }`, `extensions.hostId` set.
- **registerHostResult** (server → client): `type: "registerHostResult"`, `payload: { accepted, reason?, activeHostId? }`.
- Other message types: getSnapshot, getSnapshotResult, invokeAction, invokeActionResult, waitForChange, waitForChangeResult; relay uses the same envelopes over the same transport.

## Key files

| Role | File |
|------|------|
| Activation gate, dynamic imports, status mount | `activate-rune-dev-bridge.ts` |
| Enabled check (DEV / browser fallback) | `resolveEnabled()` in same file |
| Browser host: connect, register, handle requests | `rune-dev-bridge-browser-runtime.ts` |
| Vite: connection + named handler, relay routes | `vite-rune-dev-bridge.ts` |
| Envelope shape and validation | `dev-bridge-protocol.ts` |
| React entry: pass service + hmrClient into activation | `rune-dev-bridge-react.ts` |

## What can go wrong

- **Bridge never activates**: `resolveEnabled(enabled)` false → inert handle (e.g. `import.meta.env.DEV` undefined inside rune package). **Fix applied**: fallback `typeof window !== "undefined"` so browser always runs the runtime when `enabled` is not explicitly false.
- **Runtime uses WebSocket instead of HMR**: `providedHmrClient ?? getHmrClient()` is null (e.g. app doesn’t pass `import.meta.hot`, or `getHmrClient()` returns null). Then it opens `/__rune_bridge_ws`. Vite’s single WS server may not upgrade that path separately—only the HMR upgrade. So registerHost on that socket may never reach the server. **Preferred**: ensure HMR client is passed and used.
- **Server never sees registerHost**: Message not unwrapped (connection handler expects `{ type, event, data }`) or named handler not registered / not called by Vite. **Fix in place**: connection handler unwraps HMR custom and replies with wrapped `{ type: "custom", event, data }`.
- **Client never sees registerHostResult**: Server sends raw envelope but client’s `hmr.on` only fires for `type: "custom"` messages. **Fix in place**: when handling HMR-originated message, server uses `sendResponse()` which wraps the reply as custom so the client dispatches to the listener.
- **Double registration / double response**: Both connection handler and named handler might process the same message. Acceptable; client should still get at least one correct status update.

---

# Plan: Rest of Rune Dev Bridge Debugging

## Current status

- **Fixed**: Bridge was not activating because `resolveEnabled(enabled)` was false when `import.meta.env.DEV` was undefined inside the rune package. **Change**: fallback to `typeof window !== "undefined"` so in the browser the bridge runs unless `enabled={false}`.
- **Observed**: With that fix, logs show `"[rune-dev-bridge] host runtime connect via HMR"` and React mount with `hasService=true`, `hasResolvedHmrClient=true`. So the runtime **does** start and **does** use the HMR path and send `registerHost`.
- **Still open**: UI sometimes still shows "Disconnected" (or only "Connected" and not "Host Active"). So either:
  - The server is not receiving the HMR message, or
  - The server is not replying, or
  - The reply is not in the shape the client expects, or
  - The client is not updating status from the reply.

## Priorities (in order)

1. **Confirm server receives registerHost**  
   Add minimal, temporary logging in the Vite plugin (e.g. in `processBridgeEnvelope` when `isHmrCustom` and `envelope.type === "registerHost"`, and in the `server.ws.on(runeDevBridgeEventName, ...)` handler). Restart dev server, load app, check **server** stdout for those logs. If neither fires, the message is not reaching the plugin (Vite WS message handling or plugin order).

2. **Confirm server sends registerHostResult**  
   In the same places, log right before `sendResponse(registerHostResult)` / `transport.send(registerHostResult)`. If server logs "received registerHost" but not "sending registerHostResult", fix the handler (e.g. wrong path, throw, or early return). If both log, server is sending.

3. **Confirm client receives and handles registerHostResult**  
   In the browser runtime, add a temporary log inside the HMR `onMessage` when `envelope.type === "registerHostResult"` (and optionally when any envelope is validated). Reload app and check **browser** console. If server sends but client never logs, the reply is not reaching the client’s HMR listener (wrong shape or wrong event). If client logs but UI stays Disconnected, the bug is in `setStatus` or in the React/status-element wiring.

4. **Remove temporary logs and harden**  
   Once the failing step is found and fixed, remove all temporary `console.log` / server logs. Re-test with a single tab: after load, status should go to Connected then Host Active. Re-test with refresh: last connection wins, status should again show Host Active.

5. **Optional: strip debug UI logs**  
   Remove the React bridge mount and runtime "connect via HMR/WebSocket" logs from the rune package so production builds stay clean.

## Suggested execution

- **Step A**: Add server-side logs (plugin) only; run `pnpm dev`, open app, watch server terminal. Interpret: no "received registerHost" → message not reaching plugin; "received" but no "sending" → handler bug; both → server is correct, move to client.
- **Step B**: Add client-side log in HMR `onMessage` for `registerHostResult`; reload, watch browser console. No log → response not delivered to listener (shape/event). Log present but UI wrong → status/React wiring.
- **Step C**: Fix the failing step (message delivery, response shape, or status update). Re-test end-to-end.
- **Step D**: Remove temporary logs; optionally remove debug logs from rune; update plan.md or README if needed.

## Constraints (from please.mdc)

- Do one thing at a time; get user approval before moving on when the plan says so.
- Do not modify files unless the command or user explicitly asks; for this plan, the explicit ask is to add the debugging plan and execute the debugging steps.

---

# Plan: Action Snapshot Pattern Update

## Goal

1. **Snapshot/action shape** — Use `description`, `inputSchema`, `method`, `href`, `bodyDescription` (no `name`, no `bodyExample`, no `_actionRequestBody`).
2. **Description first** — Object key order matters: `description` is the first field in the top-level snapshot (getSnapshot only) and in each action.
3. **GET ?post= for humans** — Middleware converts `GET .../actions/playMove?post=4` into an equivalent POST (body = value from query) so humans can test via browser address bar; `GET .../resetGame?post` with no value → POST with no body.

---

## Current vs Target

| Aspect | Current | Target |
|--------|---------|--------|
| Snapshot top-level | `revision`, `states`, `actions`, `_actionRequestBody`, `description?` | `description?` (first), `revision`, `states`, `actions` |
| Action shape | `input`, `method`, `href`, `meta?` | `description`, `inputSchema?`, `method`, `href`, `bodyDescription?`, `meta?` |
| `_actionRequestBody` | Present | Remove |
| GET to action URL | Not supported | Supported: `?post` or `?post=<value>` → convert to POST, then relay |

---

## Files to Change

| File | Changes |
|------|---------|
| `rune-dev-bridge-browser-runtime.ts` | Update `BridgeSnapshot` type, `buildSnapshot()`, action builder (description from `actionMeta`, inputSchema, bodyDescription), key order (description first); remove `ACTION_REQUEST_CONVENTION` and `_actionRequestBody`. |
| `vite-rune-dev-bridge.ts` | Add GET handling for `/__rune_bridge/actions/<name>`: if `?post` or `?post=<value>` in query, parse query, derive body (or empty), then call same relay logic as POST. |
| `README.md` | Update "Using the bridge" to reflect new action shape; document GET ?post= for human testing. |

---

## Implementation Checklist

### Step 1: Browser runtime — action shape and key order

- [ ] Remove `ACTION_REQUEST_CONVENTION` and `_actionRequestBody` from type and `buildSnapshot`.
- [ ] Add per-action `description` (from `actionMeta.description`) and `bodyDescription` (when action has input: `"JSON value matching inputSchema"`).
- [ ] Rename `input` → `inputSchema`; use `bodySchema(action)` as the value; omit `inputSchema` and `bodyDescription` for no-input actions.
- [ ] For each action object, use key order: `description`, then `inputSchema` (if any), `method`, `href`, `bodyDescription` (if any), `meta` (if any).
- [ ] For top-level snapshot (getSnapshot only): key order `description` (first, when present), `revision`, `states`, `actions`.

### Step 2: Browser runtime — wait action

- [ ] Update `wait` action to same shape: `description: "Wait for state change"` (first), `inputSchema`, `method`, `href`, `bodyDescription`, `meta: true`.

### Step 3: Vite middleware — GET ?post= shim

- [ ] For `GET /__rune_bridge/actions/<actionName>` with query param `post` (present, value optional):
  - If `post` has a value: treat as JSON body string (e.g. `?post=4` → body `"4"`; `?post={"x":1}` → body `"{\"x\":1}"`).
  - If `post` with no value or empty: body = empty/undefined.
  - Run the same relay logic as POST (parse actionName, relay invokeAction or waitForChange with that body).
- [ ] If GET without `?post`, return 405 or 400 (method not allowed for GET without the shim).

### Step 4: README

- [ ] Update snapshot description: `description` first, `revision`, `states`, `actions`; each action has `description`, `inputSchema?`, `method`, `href`, `bodyDescription?`.
- [ ] Add note: `GET .../actions/playMove?post=4` works for human testing (equivalent to POST with body `4`).

---

## Suggested Execution Order

1. **Step 1–2** (browser runtime) — Shape and order; no server changes yet.
2. **Step 3** (Vite middleware) — GET ?post= support.
3. **Step 4** (README) — Docs update.
4. **Verify** — curl GET snapshot, curl POST action, browser GET ?post=.

---

## Object Key Order (JavaScript)

Use explicit object literals with keys in the desired order; `JSON.stringify` preserves insertion order for string keys. Example:

```ts
// Action with input
{
  description: action.description,
  inputSchema: bodySchema(action),
  method: "POST",
  href: `...`,
  bodyDescription: "JSON value matching inputSchema"
}

// Snapshot (getSnapshot only)
{
  description: serviceDescription,
  revision,
  states,
  actions
}
```
