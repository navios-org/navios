import swc from 'unplugin-swc'
import { defineProject } from 'vitest/config'

export default defineProject({
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
    // What is in `e2e/bun` runs with `bun test`.
    exclude: ['e2e/bun/**', '**/node_modules/**'],
    typecheck: {
      enabled: true,
    },
  },
})
