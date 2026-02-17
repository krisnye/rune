# rune
Jiron based server for controlling adobe/data ECS based applications.

## AI Bridge

The Rune dev bridge lets an AI agent control your app over the Vite dev server: it gets a live snapshot (states + actions) and can invoke actions by POSTing to the bridge. Only active in development.

### Setup

1. **Vite** — Add the bridge plugin and exclude rune from optimizeDeps (so the bridge runs correctly in dev):
   - [packages/tictactoe/vite.config.ts](packages/tictactoe/vite.config.ts): `createRuneDevBridgeVitePlugin()` in `plugins`, and `exclude: ["@paralleldrive/rune"]` in `optimizeDeps`.

2. **React** — Mount the bridge with your `AgenticService` and the HMR client:
   - [packages/tictactoe/src/App.tsx](packages/tictactoe/src/App.tsx): import `RuneDevBridgeReact` from `@paralleldrive/rune/react`, then render `<RuneDevBridgeReact service={db.services.agent} hmrClient={import.meta.hot} />` (e.g. inside your app tree, passing the service from your database/plugin).

Your app must expose an `AgenticService` (states + actions) for the bridge to serve; the bridge only wires it to HTTP. Example service definition: [packages/tictactoe/src/plugins/agent-plugin.ts](packages/tictactoe/src/plugins/agent-plugin.ts).

### Using the bridge

- **Base URL** (with dev server running): `http://localhost:<port>/__rune_bridge`
- **Snapshot**: `GET /__rune_bridge` returns `{ revision, states, actions, _actionRequestBody }`. Each action has `input` (JSON schema for the request body), `method: "POST"`, and `href`.
- **Call an action**: POST to the action’s `href` with `Content-Type: application/json`. The **body is the raw input** (e.g. `4` for a cell index, or `{ "timeoutMs": 5000 }` for `wait`). Do not wrap in `{ "input": ... }`.
- **Wait for change**: POST to `/__rune_bridge/actions/wait` with optional body `{ "since": revision, "timeoutMs": ms }` to block until state changes or timeout; response includes `{ ok, timedOut, snapshot }`.
- **Host status**: `GET /__rune_bridge_host` returns connection and host id when the app tab is open and registered.
