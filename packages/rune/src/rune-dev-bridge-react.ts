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
  readonly service: AgenticService;
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

export const RuneDevBridgeReact = ({
  service,
  enabled,
  hmrClient,
  showStatus = true,
  statusClassName,
  statusLabels,
  statusPosition,
  onStatusChange
}: RuneDevBridgeReactProps): ReactElement | null => {
  const [statusHost, setStatusHost] = useState<unknown>(null);

  useRuneDevBridgeReact({
    service,
    enabled,
    hmrClient,
    debugUi: showStatus
      ? {
          host: statusHost,
          className: statusClassName,
          labels: statusLabels,
          position: statusPosition
        }
      : undefined,
    onStatusChange
  });

  if (!showStatus) {
    return null;
  }

  return createElement("div", {
    ref: (node: unknown) => {
      setStatusHost(node);
    }
  });
};
