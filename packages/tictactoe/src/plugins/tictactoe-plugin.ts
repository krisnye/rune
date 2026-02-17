import { Database } from "@adobe/data/ecs";
import { agentPlugin } from "./agent-plugin.js";

export const tictactoePlugin: typeof agentPlugin = agentPlugin;

export type TictactoeModelDatabase = Database.FromPlugin<typeof tictactoePlugin>;
