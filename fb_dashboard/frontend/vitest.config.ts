import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

/**
 * v11-A5 — unit-test infrastructure (vitest).
 *
 * - React plugin so *.tsx components test with the same JSX transform as the app.
 * - jsdom environment for @testing-library/react.
 * - Path alias `@/` mirrors tsconfig.json paths ("@/*" → "./src/*") exactly.
 * - Tests are co-located with sources as `*.test.ts(x)`; the include pattern is
 *   restricted to src/ so the Playwright e2e specs are never picked up.
 * - Coverage provider (@vitest/coverage-v8) is installed; run with
 *   `npx vitest run --coverage` (output lands in coverage/, git-ignored).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
})
