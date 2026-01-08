import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    projects: [
      {
        test: {
          include: ['src/**/__tests__/**/*.spec.mts'],
          exclude: ['src/**/__tests__/**/*.browser.spec.mts'],
          typecheck: {
            enabled: true,
          },
        },
      },
      {
        test: {
          include: ['src/**/__tests__/**/*.browser.spec.mts'],
        },
        resolve: {
          alias: {
            './async-local-storage.mjs': './async-local-storage.browser.mjs',
          },
        },
      },
    ],
  },
})
