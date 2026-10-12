import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Each file gets its own database; running files one at a time keeps
    // timing-sensitive concurrency tests free of cross-file noise.
    fileParallelism: false,
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
