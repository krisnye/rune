import { useRef, useState } from "react";

const bridgeUrl =
  typeof window !== "undefined" ? `${window.location.origin}/__rune_bridge` : "";

export const PlayAgainstAiInstructions = () => {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const instructions = `IMPORTANT! Do not scan any files or research anything within the codebase.

curl this url and play the game: ${bridgeUrl}

Describe why you are taking each action concisely before each curl.`;

  const handleClick = (): void => {
    if (preRef.current) {
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(preRef.current);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    void navigator.clipboard.writeText(instructions).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section style={{ marginTop: "1.5rem", padding: "0 0.5rem", maxWidth: 640 }}>
      <h2 style={{ fontSize: "1rem", color: "#111827", fontWeight: 600, marginBottom: "0.5rem" }}>
        How to play against AI
      </h2>
      <p style={{ color: "#1f2937", fontSize: "0.9375rem", fontWeight: 500, marginBottom: "0.5rem" }}>
        Paste this into an LLM that has curl execution privileges:
      </p>
      <pre
        ref={preRef}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => e.key === "Enter" && handleClick()}
        style={{
          background: "#374151",
          color: "#f9fafb",
          padding: "1rem",
          borderRadius: 4,
          overflow: "auto",
          fontSize: "0.875rem",
          whiteSpace: "pre-wrap",
          cursor: "pointer",
          border: "1px solid #4b5563",
          margin: 0
        }}
        title="Click to copy"
      >
        {instructions}
      </pre>
      {copied && (
        <span style={{ fontSize: "0.75rem", color: "#059669", marginTop: "0.25rem", display: "block" }}>
          Copied to clipboard
        </span>
      )}
    </section>
  );
};
