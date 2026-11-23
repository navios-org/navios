import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    include: ['src/**/__tests__/**/*.spec.mts'],
  },
})
