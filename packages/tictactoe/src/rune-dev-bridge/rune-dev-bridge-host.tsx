import { RuneDevBridgeReact } from "@paralleldrive/rune/react";
import { useDatabase } from "../hooks/use-database.js";

export const RuneDevBridgeHost = () => {
  const db = useDatabase();
  const agentService = db.services.agent;

  return (
    <RuneDevBridgeReact
      service={agentService}
      enabled={import.meta.env.DEV}
      hmrClient={import.meta.hot}
      showStatus
    />
  );
};
