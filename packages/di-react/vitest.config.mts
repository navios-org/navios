import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/__tests__/**/*.spec.mts'],
  },
  resolve: {
    conditions: ['browser', 'development', 'import'],
  },
})
