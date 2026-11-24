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
    include: ['src/**/*.spec.mts'],
    typecheck: {
      enabled: true,
    },
  },
})
