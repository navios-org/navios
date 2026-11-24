import { resolve } from 'node:path'

import swc from 'unplugin-swc'
import { defineProject } from 'vitest/config'

export default defineProject({
  plugins: [
    // The spec uses standard (TC39 2022-03) decorators and JSX. Vitest's
    // default transform handles neither the way this package needs, so SWC
    // compiles both: decorators are downleveled and JSX goes through the
    // automatic runtime of this package.
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', tsx: true, decorators: true },
        transform: {
          decoratorVersion: '2022-03',
          react: { runtime: 'automatic', importSource: '@navios/adapter-xml' },
        },
      },
    }),
  ],
  test: {
    include: ['e2e/in-memory/**/*.spec.tsx', 'e2e/fastify/**/*.spec.tsx'],
    typecheck: {
      enabled: true,
    },
  },
  resolve: {
    alias: {
      '@navios/adapter-xml/jsx-dev-runtime': resolve(
        import.meta.dirname,
        'src/jsx-dev-runtime.mts',
      ),
      '@navios/adapter-xml/jsx-runtime': resolve(import.meta.dirname, 'src/jsx-runtime.mts'),
    },
  },
})
