import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Integration tests share one local Postgres and wipe tables between
    // cases, so they cannot run concurrently with each other. Unit tests
    // are unaffected by the single fork.
    fileParallelism: false,
    // Those wipes also destroy the development fixture, so it is put
    // back once the run finishes.
    globalSetup: ['./tests/restore-fixture.ts'],
  },
})
