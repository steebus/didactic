import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    // Integration tests share one local Postgres and wipe tables between
    // cases, so they cannot run concurrently with each other. Unit tests
    // are unaffected by the single fork.
    fileParallelism: false,
  },
})
