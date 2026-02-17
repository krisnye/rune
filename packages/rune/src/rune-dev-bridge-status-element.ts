import {
  type RuneDevBridgeDebugLabels,
  type RuneDevBridgeStatus
} from "./rune-dev-bridge-client-types.js";

const runeBridgeStatusTagName = "rune-bridge-status";
const statusElementAttribute = "data-rune-bridge-status";

const defaultLabels: RuneDevBridgeDebugLabels = {
  disconnected: "Bridge: Disconnected",
  connectedStandby: "Bridge: Connected (standby)",
  hostActive: "Bridge: Host Active"
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const createLabelAndColor = ({
  status,
  labels
}: {
  readonly status: RuneDevBridgeStatus;
  readonly labels: RuneDevBridgeDebugLabels;
}): { readonly label: string; readonly color: string } => {
  if (status.hostAccepted) {
    return { label: labels.hostActive, color: "#22c55e" };
  }
  if (status.socketConnected) {
    return { label: labels.connectedStandby, color: "#f59e0b" };
  }
  return { label: labels.disconnected, color: "#ef4444" };
};

const createStatusMarkup = ({
  status,
  labels
}: {
  readonly status: RuneDevBridgeStatus;
  readonly labels: RuneDevBridgeDebugLabels;
}): string => {
  const { label, color } = createLabelAndColor({ status, labels });
  return `<span style="display:inline-flex;align-items:center;color:${color};border:1px solid ${color};border-radius:999px;padding:0.1rem 0.55rem;font-size:0.8rem;">${label}</span>`;
};

const getCustomElementsRegistry = (): {
  readonly get: (name: string) => unknown;
  readonly define: (name: string, ctor: unknown) => void;
} | null => {
  const maybeCustomElements = (globalThis as { readonly customElements?: unknown }).customElements;
  if (!isRecord(maybeCustomElements)) {
    return null;
  }

  const hasFns = typeof maybeCustomElements.get === "function" && typeof maybeCustomElements.define === "function";
  if (!hasFns) {
    return null;
  }

  return maybeCustomElements as {
    readonly get: (name: string) => unknown;
    readonly define: (name: string, ctor: unknown) => void;
  };
};

const ensureStatusElementDefined = (): boolean => {
  const registry = getCustomElementsRegistry();
  if (!registry) {
    return false;
  }

  if (registry.get(runeBridgeStatusTagName)) {
    return true;
  }

  const maybeHTMLElement = (globalThis as { readonly HTMLElement?: unknown }).HTMLElement;
  if (typeof maybeHTMLElement !== "function") {
    return false;
  }

  class RuneBridgeStatusElement extends (maybeHTMLElement as { new (): { attachShadow?: (options: { mode: "open" }) => { innerHTML: string } } }) {
    #status: RuneDevBridgeStatus = {
      socketConnected: false,
      hostAccepted: false,
      hostId: ""
    };

    #labels: RuneDevBridgeDebugLabels = defaultLabels;

    #shadow: { innerHTML: string } | null = null;

    connectedCallback(): void {
      const self = this as unknown as {
        readonly attachShadow?: (options: { readonly mode: "open" }) => { innerHTML: string };
      };
      this.#shadow = self.attachShadow ? self.attachShadow({ mode: "open" }) : null;
      this.#render();
    }

    set status(value: RuneDevBridgeStatus) {
      this.#status = value;
      this.#render();
    }

    set labels(value: RuneDevBridgeDebugLabels) {
      this.#labels = value;
      this.#render();
    }

    #render(): void {
      const markup = createStatusMarkup({
        status: this.#status,
        labels: this.#labels
      });

      if (this.#shadow) {
        this.#shadow.innerHTML = markup;
        return;
      }

      const self = this as unknown as { innerHTML: string };
      self.innerHTML = markup;
    }
  }

  registry.define(runeBridgeStatusTagName, RuneBridgeStatusElement);
  return true;
};

const createElement = (): unknown | null => {
  const maybeDocument = (globalThis as { readonly document?: unknown }).document;
  if (!isRecord(maybeDocument) || typeof maybeDocument.createElement !== "function") {
    return null;
  }
  return (maybeDocument.createElement as (tagName: string) => unknown)(runeBridgeStatusTagName);
};

const toElementRecord = (value: unknown): Record<string, unknown> | null =>
  isRecord(value) ? value : null;

const setElementStatus = ({
  element,
  status,
  labels
}: {
  readonly element: unknown;
  readonly status: RuneDevBridgeStatus;
  readonly labels: RuneDevBridgeDebugLabels;
}): void => {
  const asRecord = toElementRecord(element);
  if (!asRecord) {
    return;
  }
  asRecord.status = status;
  asRecord.labels = labels;
};

const mountElement = ({
  host,
  element,
  position
}: {
  readonly host: unknown;
  readonly element: unknown;
  readonly position: "append" | "prepend" | "replace";
}): void => {
  const hostRecord = toElementRecord(host);
  if (!hostRecord) {
    return;
  }

  if (position === "replace" && typeof hostRecord.replaceChildren === "function") {
    hostRecord.replaceChildren(element);
    return;
  }
  if (position === "prepend" && typeof hostRecord.prepend === "function") {
    hostRecord.prepend(element);
    return;
  }
  if (typeof hostRecord.appendChild === "function") {
    hostRecord.appendChild(element);
  }
};

const findExistingElement = (host: unknown): unknown | null => {
  const hostRecord = toElementRecord(host);
  if (!hostRecord || typeof hostRecord.querySelector !== "function") {
    return null;
  }
  return hostRecord.querySelector(`[${statusElementAttribute}="true"]`);
};

export const mountRuneBridgeStatusElement = ({
  host,
  status,
  className,
  labels,
  position = "append"
}: {
  readonly host: unknown;
  readonly status: RuneDevBridgeStatus;
  readonly className?: string;
  readonly labels?: Partial<RuneDevBridgeDebugLabels>;
  readonly position?: "append" | "prepend" | "replace";
}): { readonly element: unknown | null; readonly update: (nextStatus: RuneDevBridgeStatus) => void; readonly remove: () => void } => {
  if (!host || !ensureStatusElementDefined()) {
    return {
      element: null,
      update: () => {},
      remove: () => {}
    };
  }

  const mergedLabels = {
    ...defaultLabels,
    ...(labels ?? {})
  };

  const existing = findExistingElement(host);
  const element = existing ?? createElement();
  if (!element) {
    return {
      element: null,
      update: () => {},
      remove: () => {}
    };
  }

  const elementRecord = toElementRecord(element);
  if (elementRecord) {
    if (typeof elementRecord.setAttribute === "function") {
      elementRecord.setAttribute(statusElementAttribute, "true");
    } else {
      elementRecord[statusElementAttribute] = "true";
    }
    if (elementRecord.style && typeof elementRecord.style === "object") {
      (elementRecord.style as Record<string, string>).display = "inline-block";
    }
    if (className && "className" in elementRecord) {
      elementRecord.className = className;
    }
  }

  if (!existing) {
    mountElement({
      host,
      element,
      position
    });
  }

  setElementStatus({
    element,
    status,
    labels: mergedLabels
  });

  return {
    element,
    update: (nextStatus) => {
      setElementStatus({
        element,
        status: nextStatus,
        labels: mergedLabels
      });
    },
    remove: () => {
      const asRecord = toElementRecord(element);
      if (asRecord && typeof asRecord.remove === "function") {
        asRecord.remove();
      }
    }
  };
};
