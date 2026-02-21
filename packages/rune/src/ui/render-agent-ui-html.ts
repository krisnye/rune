export interface RenderAgentUiHtmlArgs {
  readonly apiBasePath: string;
  readonly title?: string;
}

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll("\"", "&quot;")
  .replaceAll("'", "&#39;");

export const renderAgentUiHtml = ({
  apiBasePath,
  title = "Rune Agent UI"
}: RenderAgentUiHtmlArgs): string => {
  const normalizedApiBasePath = apiBasePath === "" ? "/" : apiBasePath;
  const safeTitle = escapeHtml(title);
  const safePath = JSON.stringify(normalizedApiBasePath);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; }
    h1 { margin-bottom: 0.5rem; }
    .row { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; flex: 1; min-width: 280px; }
    label { display: block; font-weight: 600; margin-bottom: 0.25rem; }
    select, textarea, input, button { width: 100%; padding: 0.5rem; font: inherit; }
    button { cursor: pointer; }
    pre { background: #111; color: #eaeaea; padding: 0.75rem; border-radius: 6px; overflow: auto; }
    .muted { color: #666; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  <p class="muted">Interact with the rune server snapshot and actions.</p>

  <div class="row">
    <div class="card">
      <label for="actionName">Action</label>
      <select id="actionName"></select>
      <label for="actionInput" style="margin-top: 0.75rem;">Action JSON input</label>
      <textarea id="actionInput" rows="6" placeholder="42, {&quot;index&quot;: 4}, or leave empty for no input"></textarea>
      <div class="row" style="margin-top: 0.75rem;">
        <button id="runAction">Run Action</button>
        <button id="refresh">Refresh Snapshot</button>
      </div>
      <div id="waitRow" class="row" style="margin-top: 0.75rem;">
        <input id="waitTimeoutMs" type="number" min="0" value="60000" />
        <button id="waitForChange">Wait For Change</button>
      </div>
    </div>

    <div class="card">
      <label>Response</label>
      <pre id="response">{}</pre>
    </div>
  </div>

  <div class="row">
    <div class="card">
      <label>Snapshot</label>
      <pre id="snapshot">{}</pre>
    </div>
  </div>

  <script type="module">
    const apiBasePath = ${safePath};
    const rootUrl = apiBasePath.endsWith("/") ? apiBasePath : apiBasePath + "/";
    const actionsUrl = apiBasePath === "/" ? "/actions/" : apiBasePath + "/actions/";
    const responseEl = document.getElementById("response");
    const snapshotEl = document.getElementById("snapshot");
    const actionNameEl = document.getElementById("actionName");
    const actionInputEl = document.getElementById("actionInput");
    const waitTimeoutMsEl = document.getElementById("waitTimeoutMs");

    let currentSnapshot = null;

    const setResponse = (value) => {
      responseEl.textContent = JSON.stringify(value, null, 2);
    };

    const waitRowEl = document.getElementById("waitRow");

    const setSnapshot = (snapshot) => {
      currentSnapshot = snapshot;
      snapshotEl.textContent = JSON.stringify(snapshot, null, 2);
      const names = Object.keys(snapshot?.actions ?? {});
      actionNameEl.innerHTML = names.map((name) => '<option value="' + name + '">' + name + '</option>').join("");
      if (waitRowEl) {
        waitRowEl.style.display = Object.prototype.hasOwnProperty.call(snapshot?.actions ?? {}, "wait") ? "" : "none";
      }
    };

    const fetchSnapshot = async () => {
      const response = await fetch(rootUrl);
      const payload = await response.json();
      setResponse(payload);
      if (payload?.snapshot) {
        setSnapshot(payload.snapshot);
      }
      return payload;
    };

    const parseInput = () => {
      const raw = actionInputEl.value.trim();
      if (raw === "") {
        return undefined;
      }
      return JSON.parse(raw);
    };

    const runAction = async (actionName, input) => {
      const response = await fetch(actionsUrl + encodeURIComponent(actionName), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: input === undefined ? "" : JSON.stringify(input)
      });
      const payload = await response.json();
      setResponse(payload);
      if (payload?.snapshot) {
        setSnapshot(payload.snapshot);
      }
      return payload;
    };

    document.getElementById("refresh").addEventListener("click", async () => {
      await fetchSnapshot();
    });

    document.getElementById("runAction").addEventListener("click", async () => {
      try {
        const actionName = actionNameEl.value;
        if (!actionName) {
          setResponse({ ok: false, error: "Select an action first" });
          return;
        }
        const input = parseInput();
        await runAction(actionName, input);
      } catch (error) {
        setResponse({ ok: false, error: String(error) });
      }
    });

    document.getElementById("waitForChange").addEventListener("click", async () => {
      if (!currentSnapshot) {
        await fetchSnapshot();
      }
      const timeoutMs = Number(waitTimeoutMsEl.value ?? 60000);
      await runAction("wait", {
        since: currentSnapshot?.revision ?? 0,
        timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 60000
      });
    });

    await fetchSnapshot();
  </script>
</body>
</html>`;
};
