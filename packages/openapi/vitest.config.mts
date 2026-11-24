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
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.lib.json',
    },
    // `.spec-d.mts` files are type-only tests handled by vitest's typecheck pass;
    // they must not run as runtime tests (their decorator usage is swc-transpiled and
    // would execute at runtime). Keep the runtime include to `.spec.mts` only.
    include: ['src/**/*.spec.mts'],
  },
})
