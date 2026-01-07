import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['e2e/**/*.spec.mts'],
    globals: false,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
