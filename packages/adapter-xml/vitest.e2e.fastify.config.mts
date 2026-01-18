import { resolve } from 'node:path'

import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    include: ['e2e/fastify/**/*.spec.tsx'],
    typecheck: {
      enabled: true,
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: '@navios/adapter-xml',
    loader: 'tsx',
  },
  resolve: {
    alias: {
      '@navios/adapter-xml/jsx-dev-runtime': resolve(__dirname, 'src/jsx-dev-runtime.mts'),
      '@navios/adapter-xml/jsx-runtime': resolve(__dirname, 'src/jsx-runtime.mts'),
    },
  },
})
