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
  resolve: {
    conditions: ['development', 'node', 'import'],
  },
  test: {
    // e2e/bun needs the Bun runtime and is run by `bun test`.
    include: ['src/**/*.spec.mts', 'e2e/fastify/**/*.spec.mts'],
    typecheck: {
      enabled: true,
    },
  },
})
