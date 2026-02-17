import {
  createDefaultBridgeStatus,
  type ActivateRuneDevBridgeArgs,
  type ActivatedRuneDevBridge,
  type RuneDevBridgeDebugLabels,
  type RuneDevBridgeDebugUiOptions,
  type RuneDevBridgeStatus
} from "./rune-dev-bridge-client-types.js";

const resolveEnabled = (enabled: boolean | undefined): boolean => {
  if (enabled !== undefined) {
    return enabled;
  }

  const maybeImportMeta = import.meta as unknown as { readonly env?: { readonly DEV?: unknown } };
  const devFlag = maybeImportMeta.env?.DEV;

  if (devFlag === true) {
    return true;
  }

  if (devFlag === false) {
    return false;
  }

  // Fallback: if we're running in a browser (no explicit env flag),
  // assume dev mode so the bridge can be used without extra wiring.
  return typeof window !== "undefined";
};

const createInertHandle = (): ActivatedRuneDevBridge => {
  const defaultStatus = createDefaultBridgeStatus();
  return {
    enabled: false,
    element: null,
    getStatus: () => defaultStatus,
    stop: () => {}
  };
};

const createStopController = (): {
  readonly markStopped: () => void;
  readonly isStopped: () => boolean;
} => {
  let stopped = false;
  return {
    markStopped: () => {
      stopped = true;
    },
    isStopped: () => stopped
  };
};

export {
  type ActivateRuneDevBridgeArgs,
  type ActivatedRuneDevBridge,
  type RuneDevBridgeDebugLabels,
  type RuneDevBridgeDebugUiOptions,
  type RuneDevBridgeStatus
};

export const activateRuneDevBridge = async ({
  service,
  enabled,
  debugUi,
  transport,
  onStatusChange
}: ActivateRuneDevBridgeArgs): Promise<ActivatedRuneDevBridge> => {
  if (!resolveEnabled(enabled)) {
    return createInertHandle();
  }

  const stopController = createStopController();
  const runtimeModule = await import("./rune-dev-bridge-browser-runtime.js");
  const initialStatus = createDefaultBridgeStatus();
  let currentStatus: RuneDevBridgeStatus = initialStatus;
  let statusMount: {
    readonly element: unknown | null;
    readonly update: (status: RuneDevBridgeStatus) => void;
    readonly remove: () => void;
  } | null = null;

  if (stopController.isStopped()) {
    return createInertHandle();
  }

  if (debugUi?.host) {
    const statusElementModule = await import("./rune-dev-bridge-status-element.js");
    if (stopController.isStopped()) {
      return createInertHandle();
    }
    statusMount = statusElementModule.mountRuneBridgeStatusElement({
      host: debugUi.host,
      status: currentStatus,
      labels: debugUi.labels,
      className: debugUi.className,
      position: debugUi.position
    });
  }

  const runtime = runtimeModule.createRuneBrowserHostRuntime({
    service,
    wsPath: transport?.wsPath,
    reconnectDelayMs: transport?.reconnectDelayMs,
    hmrClient: transport?.hmrClient,
    onStatusChange: (nextStatus) => {
      currentStatus = nextStatus;
      statusMount?.update(nextStatus);
      onStatusChange?.(nextStatus);
    }
  });

  currentStatus = runtime.getStatus();
  statusMount?.update(currentStatus);

  return {
    enabled: true,
    element: statusMount?.element ?? null,
    getStatus: () => currentStatus,
    stop: () => {
      stopController.markStopped();
      statusMount?.remove();
      runtime.stop();
    }
  };
};
