import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
    globals: true,
    environment: "node",
    include: ["src/e2e/**/*.spec.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
    watch: false,
    maxWorkers: 1,
    fileParallelism: false,
  },
});
