import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Tests share the development database; run files sequentially.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
