import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    // Standard (TC39 2022-03) decorators: Vitest's default transform leaves
    // them in place, which Node cannot parse.
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorVersion: '2022-03' },
      },
    }),
  ],
  test: {
    include: ['e2e/**/*.spec.mts'],
    globals: false,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
