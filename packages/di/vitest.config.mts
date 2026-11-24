import swc from 'unplugin-swc'
import { defineProject } from 'vitest/config'

export default defineProject({
  // Sources use no decorator syntax; the SWC plugin is only for the tests.
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
    typecheck: {
      enabled: true,
    },
  },
})
