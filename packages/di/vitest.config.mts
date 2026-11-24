import swc from 'unplugin-swc'
import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    projects: [
      {
        plugins: [
          swc.vite({
            jsc: {
              target: 'es2022',
              parser: { syntax: 'typescript', decorators: true },
              transform: { decoratorVersion: '2022-03' },
            },
          }),
        ],
        test: {
          include: ['src/**/__tests__/**/*.spec.mts'],
          exclude: ['src/**/__tests__/**/*.browser.spec.mts'],
          typecheck: {
            enabled: true,
          },
        },
      },
      {
        plugins: [
          swc.vite({
            jsc: {
              target: 'es2022',
              parser: { syntax: 'typescript', decorators: true },
              transform: { decoratorVersion: '2022-03' },
            },
          }),
        ],
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
