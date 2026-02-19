# Connect 4

Minimal Vite + React app. Loosely based on the tictactoe package. Uses Adobe/data ECS for game state and exposes an agent plugin for AI play via the Rune dev bridge.

## Run the dev server

1. **Install dependencies** (from repo root, once):  
   `pnpm install`

2. **Start the app** — either:
   - From repo root: `pnpm --filter connect4 run dev`
   - From this folder: `pnpm run dev`

3. Open **http://localhost:3003** in your browser.

## Rune bridge (AI interactions)

The app is wired for the Rune dev bridge so an AI agent can control the game over HTTP (dev only).

- **Vite**: `createRuneDevBridgeVitePlugin()` is in the config and `@paralleldrive/rune` is excluded from `optimizeDeps`.
- **App**: `<RuneDevBridgeReact service={db.services.agent} hmrClient={import.meta.hot} />` is mounted inside the app; the service comes from the Connect 4 agent plugin.

### Using the bridge to play against an AI agent

1. Open an AI agent that can run curl requests.
2. Paste this into the chat:

   ```
   IMPORTANT! Do not scan any files or research anything within the codebase.

   curl this url and play the game: http://localhost:3003/__rune_bridge

   Describe why you are taking each action concisely before each curl.
   ```

3. The agent sees the current board and available actions (e.g. `playMove` with column 0–6, `resetGame` when the board is full) and can POST to the bridge to play.

### Testing the bridge as a human

1. Open the app at http://localhost:3003 and confirm it shows **Rune Bridge (Host Active)**.
2. In another tab, open **http://localhost:3003/__rune_bridge** to inspect state and actions.
3. Trigger an action via the URL (e.g. open the action endpoint with the expected query/post as documented by the bridge).
