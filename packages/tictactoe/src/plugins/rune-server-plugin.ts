import { Database } from "@adobe/data/ecs";
import { agentPlugin } from "./agent-plugin.js";

const runeServerPort = 4000;
const runeModuleName = "@paralleldrive/rune";

type AgentHttpServiceLike = {
  readonly start: () => Promise<{ readonly info: { readonly url: string } }>;
};

let agentHttpService: AgentHttpServiceLike | null = null;

const isBrowserRuntime = (): boolean => typeof window !== "undefined";

const startRuneServer = async (db: Database.FromPlugin<typeof agentPlugin>): Promise<void> => {
  if (agentHttpService !== null) {
    return;
  }

  const runeModule = await import(/* @vite-ignore */ runeModuleName);
  const createAgentHttpService = runeModule.createAgentHttpService as (args: {
    readonly service: unknown;
    readonly port: number;
    readonly enableUi: boolean;
  }) => AgentHttpServiceLike;

  agentHttpService = createAgentHttpService({
    service: db.services.agent,
    port: runeServerPort,
    enableUi: true
  });

  try {
    const { info } = await agentHttpService.start();
    console.log(`Rune agent server listening on ${info.url}`);
  } catch (error: unknown) {
    console.error("Failed to start rune agent server", error);
    agentHttpService = null;
  }
};

export const runeServerPlugin: ReturnType<typeof Database.Plugin.create> = Database.Plugin.create({
  extends: agentPlugin,
  systems: {
    rune_server: {
      create: (db) => {
        if (isBrowserRuntime()) {
          return;
        }

        void startRuneServer(db as Database.FromPlugin<typeof agentPlugin>);
      }
    }
  }
});
