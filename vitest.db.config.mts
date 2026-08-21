import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Aparte configuratie voor de integratietests tegen de echte Supabase-database.
 * Wordt alleen gebruikt door `npm run test:db`, nooit door `npm test`.
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
    include: ["src/**/*.dbtest.ts"],
    // De database is gedeelde toestand; parallel invoegen geeft valse fouten.
    fileParallelism: false,
  },
});
