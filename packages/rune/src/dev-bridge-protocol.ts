export const runeDevBridgeProtocolName = "rune-dev-bridge";
export const runeDevBridgeProtocolVersion = 1;

export interface BridgeError {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface BridgeEnvelope<TType extends string = string, TPayload = unknown> {
  readonly protocol: typeof runeDevBridgeProtocolName;
  readonly version: typeof runeDevBridgeProtocolVersion;
  readonly requestId: string;
  readonly type: TType;
  readonly payload?: TPayload;
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export type BridgeValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: BridgeError };

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fail = (code: string, message: string, details?: unknown): BridgeValidationResult<never> => ({
  ok: false,
  error: { code, message, details }
});

export const createBridgeEnvelope = <TType extends string, TPayload = unknown>({
  requestId,
  type,
  payload,
  extensions
}: {
  readonly requestId: string;
  readonly type: TType;
  readonly payload?: TPayload;
  readonly extensions?: Readonly<Record<string, unknown>>;
}): BridgeEnvelope<TType, TPayload> => ({
  protocol: runeDevBridgeProtocolName,
  version: runeDevBridgeProtocolVersion,
  requestId,
  type,
  payload,
  extensions
});

export const validateBridgeEnvelope = (value: unknown): BridgeValidationResult<BridgeEnvelope> => {
  if (!isObjectRecord(value)) {
    return fail("invalid_envelope_shape", "Bridge envelope must be an object");
  }

  if (value.protocol !== runeDevBridgeProtocolName) {
    return fail("invalid_protocol", "Bridge protocol name is not recognized", value.protocol);
  }

  if (value.version !== runeDevBridgeProtocolVersion) {
    return fail("unsupported_protocol_version", "Bridge protocol version is not supported", value.version);
  }

  if (typeof value.requestId !== "string" || value.requestId.trim() === "") {
    return fail("invalid_request_id", "Bridge envelope requestId must be a non-empty string", value.requestId);
  }

  if (typeof value.type !== "string" || value.type.trim() === "") {
    return fail("invalid_message_type", "Bridge envelope type must be a non-empty string", value.type);
  }

  if (value.extensions !== undefined && !isObjectRecord(value.extensions)) {
    return fail("invalid_extensions", "Bridge envelope extensions must be an object when provided", value.extensions);
  }

  return {
    ok: true,
    value: {
      protocol: runeDevBridgeProtocolName,
      version: runeDevBridgeProtocolVersion,
      requestId: value.requestId,
      type: value.type,
      payload: value.payload,
      extensions: value.extensions as Readonly<Record<string, unknown>> | undefined
    }
  };
};

export const hasMatchingRequestId = (
  request: Pick<BridgeEnvelope, "requestId">,
  response: Pick<BridgeEnvelope, "requestId">
): boolean => request.requestId === response.requestId;

export const toBridgeError = (error: unknown): BridgeError => {
  if (isObjectRecord(error) && typeof error.code === "string" && typeof error.message === "string") {
    return {
      code: error.code,
      message: error.message,
      details: error.details
    };
  }

  if (error instanceof Error) {
    return {
      code: "internal_error",
      message: error.message
    };
  }

  return {
    code: "internal_error",
    message: "Unknown bridge error",
    details: error
  };
};
