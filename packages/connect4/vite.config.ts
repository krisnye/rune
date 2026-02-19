import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createRuneDevBridgeVitePlugin } from "@paralleldrive/rune";

export default defineConfig({
  plugins: [react(), createRuneDevBridgeVitePlugin()],
  root: ".",
  build: { outDir: "dist" },
  server: { port: 3003, open: false },
  optimizeDeps: {
    exclude: ["@paralleldrive/rune"],
  },
});
