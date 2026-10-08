import { defineConfig } from 'vitest/config'

// These tests run the built command many times each; allow for a busy machine.
export default defineConfig({ test: { testTimeout: 60_000 } })
