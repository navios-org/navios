import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.lib.json',
    },
    include: [
      'src/**/*.spec.mts',
      'src/**/*.spec-d.mts',
      'src/legacy-compat/__type-tests__/**/*.spec-d.mts',
    ],
  },
})
