import { useDatabase } from "@adobe/data-react";
import { agentPlugin } from "../plugins/agent-plugin.js";

export const useConnect4Database = () => useDatabase(agentPlugin);
