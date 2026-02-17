import { useDatabase as useDatabaseHook } from "@adobe/data-react";
import { agentPlugin } from "../plugins/agent-plugin.js";

type UseDatabaseResult = ReturnType<typeof useDatabaseHook<typeof agentPlugin>>;

export const useDatabase = (): UseDatabaseResult => useDatabaseHook(agentPlugin);
