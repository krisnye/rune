import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { createRuneDevBridgeVitePlugin } from "@paralleldrive/rune";

export default defineConfig({
  plugins: [react(), checker({ typescript: true }), createRuneDevBridgeVitePlugin()],
  root: ".",
  build: { outDir: "dist" },
  server: { port: 3002, open: false },
  optimizeDeps: {
    exclude: ["@paralleldrive/rune"]
  }
});
