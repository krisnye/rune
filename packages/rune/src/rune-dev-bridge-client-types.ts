import { AgenticService } from "@adobe/data/service";

export interface RuneDevBridgeStatus {
  readonly socketConnected: boolean;
  readonly hostAccepted: boolean;
  readonly hostId: string;
}

export interface RuneDevBridgeDebugLabels {
  readonly disconnected: string;
  readonly connectedStandby: string;
  readonly hostActive: string;
}

export interface RuneDevBridgeDebugUiOptions {
  readonly host?: unknown;
  readonly position?: "append" | "prepend" | "replace";
  readonly className?: string;
  readonly labels?: Partial<RuneDevBridgeDebugLabels>;
}

export interface ActivateRuneDevBridgeArgs {
  readonly service: AgenticService;
  readonly enabled?: boolean;
  readonly debugUi?: RuneDevBridgeDebugUiOptions;
  readonly transport?: {
    readonly wsPath?: string;
    readonly reconnectDelayMs?: number;
    readonly hmrClient?: {
      readonly send: (event: string, payload: unknown) => void;
      readonly on: (event: string, callback: (payload: unknown) => void) => void;
      readonly off?: (event: string, callback: (payload: unknown) => void) => void;
    };
  };
  readonly onStatusChange?: (status: RuneDevBridgeStatus) => void;
}

export interface ActivatedRuneDevBridge {
  readonly enabled: boolean;
  readonly element: unknown | null;
  readonly getStatus: () => RuneDevBridgeStatus;
  readonly stop: () => void;
}

export const createDefaultBridgeStatus = ({
  hostId = ""
}: {
  readonly hostId?: string;
} = {}): RuneDevBridgeStatus => ({
  socketConnected: false,
  hostAccepted: false,
  hostId
});
