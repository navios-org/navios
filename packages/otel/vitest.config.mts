import { defineProject } from 'vitest/config'

export default defineProject({
  resolve: {
    conditions: ['development', 'node', 'import'],
  },
  test: {
    typecheck: {
      enabled: true,
    },
  },
})
