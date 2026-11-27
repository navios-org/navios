import swc from 'unplugin-swc'
import { defineProject } from 'vitest/config'

export default defineProject({
  plugins: [
    // The tests write controllers with standard decorators; the package itself has none.
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorVersion: '2022-03' },
      },
    }),
  ],
  test: {
    typecheck: {
      enabled: true,
    },
  },
})
