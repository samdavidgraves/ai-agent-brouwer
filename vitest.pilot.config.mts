import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Proef op het echte dossier in "Pilot data/". Draait alleen via `npm run test:pilot`
 * en nooit als onderdeel van `npm test`, omdat het vertrouwelijke documenten leest.
 * Volledig lokaal: geen Supabase, geen netwerk.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.pilottest.ts"],
    testTimeout: 120_000,
  },
});
