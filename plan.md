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
