export interface RuneServerConfig {
  readonly basePath?: string;
}

export interface RuneServerDescriptor {
  readonly name: "@paralleldrive/rune";
  readonly protocol: "jiron";
  readonly basePath: string;
}

export const createRuneServerDescriptor = (
  config: RuneServerConfig = {}
): RuneServerDescriptor => {
  const basePath = config.basePath ?? "/";

  return {
    name: "@paralleldrive/rune",
    protocol: "jiron",
    basePath
  };
};

export {
  createAgentHttpService,
  type CreateAgentHttpServiceArgs,
  type AgentHttpServiceInfo,
  type StartAgentHttpServiceResult,
  type AgentActionDescriptor,
  type AgentSnapshot,
  type AgentHttpService
} from "./agent-http-service.js";

export {
  runeDevBridgeProtocolName,
  runeDevBridgeProtocolVersion,
  createBridgeEnvelope,
  validateBridgeEnvelope,
  hasMatchingRequestId,
  toBridgeError,
  type BridgeError,
  type BridgeEnvelope,
  type BridgeValidationResult
} from "./dev-bridge-protocol.js";

export {
  runeDevBridgeWsPath,
  runeDevBridgeHostStatusPath,
  runeDevBridgeApiPath,
  runeDevBridgeEventName,
  createBridgeHostRegistry,
  createRuneDevBridgeVitePlugin,
  type BridgeHostStatus,
  type BridgeHostRegistry,
  type RuneDevBridgeVitePluginConfig
} from "./vite-rune-dev-bridge.js";

export {
  activateRuneDevBridge,
  type ActivateRuneDevBridgeArgs,
  type ActivatedRuneDevBridge,
  type RuneDevBridgeStatus,
  type RuneDevBridgeDebugLabels,
  type RuneDevBridgeDebugUiOptions
} from "./activate-rune-dev-bridge.js";
