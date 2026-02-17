import { type AgenticService } from "@adobe/data/service";
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement
} from "react";
import { activateRuneDevBridge } from "./activate-rune-dev-bridge.js";
import {
  createDefaultBridgeStatus,
  type RuneDevBridgeDebugLabels,
  type RuneDevBridgeStatus
} from "./rune-dev-bridge-client-types.js";

type HmrClient = {
  readonly send: (event: string, payload: unknown) => void;
  readonly on: (event: string, callback: (payload: unknown) => void) => void;
  readonly off?: (event: string, callback: (payload: unknown) => void) => void;
};

export interface UseRuneDevBridgeReactArgs {
  readonly service: AgenticService | undefined;
  readonly enabled?: boolean;
  readonly hmrClient?: HmrClient;
  readonly debugUi?: {
    readonly host?: unknown;
    readonly className?: string;
    readonly labels?: Partial<RuneDevBridgeDebugLabels>;
    readonly position?: "append" | "prepend" | "replace";
  };
  readonly onStatusChange?: (status: RuneDevBridgeStatus) => void;
}

/**
 * Props for the dev bridge host component.
 * Only `service` is required; pass your AgenticService (e.g. from db.services.agent).
 * In Vite, `enabled` and `hmrClient` default from import.meta.env.DEV and import.meta.hot.
 */
export interface RuneDevBridgeReactProps {
  readonly service: AgenticService;
  readonly enabled?: boolean;
  readonly hmrClient?: HmrClient;
  readonly showStatus?: boolean;
  readonly statusClassName?: string;
  readonly statusLabels?: Partial<RuneDevBridgeDebugLabels>;
  readonly statusPosition?: "append" | "prepend" | "replace";
  readonly onStatusChange?: (status: RuneDevBridgeStatus) => void;
}

const useBridgeStatus = ({
  onStatusChange
}: {
  readonly onStatusChange?: (status: RuneDevBridgeStatus) => void;
}): {
  readonly status: RuneDevBridgeStatus;
  readonly setStatus: (status: RuneDevBridgeStatus) => void;
} => {
  const [status, setStatusState] = useState<RuneDevBridgeStatus>(() => createDefaultBridgeStatus());
  const setStatus = useCallback(
    (nextStatus: RuneDevBridgeStatus) => {
      setStatusState(nextStatus);
      onStatusChange?.(nextStatus);
    },
    [onStatusChange]
  );
  return {
    status,
    setStatus
  };
};

export const useRuneDevBridgeReact = ({
  service,
  enabled,
  hmrClient,
  debugUi,
  onStatusChange
}: UseRuneDevBridgeReactArgs): RuneDevBridgeStatus => {
  const { status, setStatus } = useBridgeStatus({ onStatusChange });
  const debugUiConfig = useMemo(
    () => ({
      host: debugUi?.host,
      className: debugUi?.className,
      labels: debugUi?.labels,
      position: debugUi?.position
    }),
    [debugUi?.className, debugUi?.host, debugUi?.labels, debugUi?.position]
  );

  useEffect(() => {
    if (service == null) {
      return;
    }
    let disposed = false;
    let stopBridge = () => {};

    void activateRuneDevBridge({
      service,
      enabled,
      transport: {
        hmrClient
      },
      debugUi: debugUiConfig,
      onStatusChange: setStatus
    }).then((bridge) => {
      if (disposed) {
        bridge.stop();
        return;
      }
      setStatus(bridge.getStatus());
      stopBridge = bridge.stop;
    });

    return () => {
      disposed = true;
      stopBridge();
    };
  }, [debugUiConfig, enabled, hmrClient, service, setStatus]);

  return status;
};

const statusLabel = (status: RuneDevBridgeStatus, labels: Partial<RuneDevBridgeDebugLabels> = {}): string => {
  if (status.hostAccepted) return labels.hostActive ?? "Host Active";
  if (status.socketConnected) return labels.connectedStandby ?? "Connected";
  return labels.disconnected ?? "Disconnected";
};

const statusColor = (status: RuneDevBridgeStatus): string => {
  if (status.hostAccepted) return "#22c55e";
  if (status.socketConnected) return "#f59e0b";
  return "#ef4444";
};

const getDefaultHmrClient = (): HmrClient | undefined => {
  const meta = typeof import.meta !== "undefined" ? (import.meta as { hot?: HmrClient }).hot : undefined;
  return meta;
};

/** Mount the rune dev bridge; only `service` is required. Use with Vite dev server + createRuneDevBridgeVitePlugin(). */
export const RuneDevBridgeReact = ({
  service,
  enabled,
  hmrClient: hmrClientProp,
  showStatus = true,
  statusLabels,
  onStatusChange
}: RuneDevBridgeReactProps): ReactElement | null => {
  const hmrClient = hmrClientProp ?? getDefaultHmrClient();
  const status = useRuneDevBridgeReact({
    service,
    enabled,
    hmrClient,
    debugUi: undefined,
    onStatusChange
  });

  if (!showStatus) {
    return null;
  }

  const label = statusLabel(status, statusLabels);
  const color = statusColor(status);

  return createElement(
    "div",
    {
      style: {
        position: "fixed",
        top: "0",
        left: "0",
        zIndex: 2147483647,
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "6px 10px",
        fontSize: "0.8rem",
        fontFamily: "system-ui, sans-serif",
        color: "#0f172a",
        background: "#facc15",
        border: "2px solid #ca8a04",
        borderRadius: "4px"
      },
      "data-rune-bridge-host": "true"
    },
    createElement("span", null, "Rune Bridge"),
    createElement("span", {
      style: {
        color,
        border: `1px solid ${color}`,
        borderRadius: "999px",
        padding: "0.1rem 0.55rem"
      }
    }, label)
  );
};
