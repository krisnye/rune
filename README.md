# rune
Jiron based server for controlling adobe/data ECS based applications.

## AI Bridge

The Rune dev bridge lets an AI agent control your app over the Vite dev server: it gets a live snapshot (states + actions) and can invoke actions by POSTing to the bridge. Only active in development.

### Setup

1. **Vite** — Add the bridge plugin and exclude rune from optimizeDeps (so the bridge runs correctly in dev):
   - [packages/tictactoe/vite.config.ts](packages/tictactoe/vite.config.ts): `createRuneDevBridgeVitePlugin()` in `plugins`, and `exclude: ["@paralleldrive/rune"]` in `optimizeDeps`.

2. **React** — Mount the bridge with your `AgenticService` and the HMR client:
   - [packages/tictactoe/src/app.tsx](packages/tictactoe/src/app.tsx): import `RuneDevBridgeReact` from `@paralleldrive/rune/react`, then render `<RuneDevBridgeReact service={db.services.agent} hmrClient={import.meta.hot} />` (e.g. inside your app tree, passing the service from your database/plugin).

Your app must expose an `AgenticService` (states + actions) for the bridge to serve; the bridge only wires it to HTTP. Example service definition: [packages/tictactoe/src/plugins/agent-plugin.ts](packages/tictactoe/src/plugins/agent-plugin.ts).

### Using the bridge to play against an ai agent.

Open up an AI agent which can create curl requests.

Paste this into the chat

```
IMPORTANT! Do not scan any files or research anything within the codebase.

curl this url and play the game: http://localhost:3003/__rune_bridge

Describe why you are taking each action concisely before each curl.
```

### Using the bridge as a human for testing.

1. Open up the app, usually at http://localhost:3003
2. Verify it says Rune Bridge (Host Active)
3. Browse another tab to `http://localhost:<port>/__rune_bridge`
4. Run an action with open `.../actions/<name>?post=<input>` or just `...?post` if there is no input.