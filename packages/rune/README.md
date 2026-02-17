# @paralleldrive/rune

Jiron-based MCP-style server primitives for ECS applications.

## Rune dev bridge

One path only: **Vite dev server**. No separate Node process.

1. **Vite** — Add `createRuneDevBridgeVitePlugin()` to your Vite config.
2. **App** — Pass your `AgenticService` into the bridge (e.g. `<RuneDevBridgeReact service={db.services.agent} showStatus />`). The only app-specific piece is where you get that service from (e.g. your Database plugin).
3. **Run** `vite` (or `pnpm dev`). AI and tools use `http://localhost:PORT/__rune_bridge`.

No double paths, no agent server script, no polyfills. Just Vite + pass your service.
