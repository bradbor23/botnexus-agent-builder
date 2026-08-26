import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built SPA can be served from any path (e.g. a BotNexus
// endpoint-contributor mounting it under /agent-builder).
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5183, strictPort: true },
});
