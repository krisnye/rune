import { useEffect } from "react";
import { DynamicService } from "@adobe/data/service";
import { createRuneBrowserHost, type RuneDevBridgeStatus } from "./create-browser-host.js";
import { useDatabase } from "../hooks/use-database.js";

export const RuneDevBridgeHost = ({
  onStatusChange
}: {
  readonly onStatusChange?: (status: RuneDevBridgeStatus) => void;
}) => {
  const db = useDatabase();

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    const agentService = (db.services as { readonly agent: DynamicService.DynamicService }).agent;
    const runtime = createRuneBrowserHost({
      service: agentService,
      onStatusChange
    });

    return () => {
      runtime.stop();
    };
  }, [db, onStatusChange]);

  return null;
};
