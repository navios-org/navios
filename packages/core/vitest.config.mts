import swc from 'unplugin-swc'
import { defineProject } from 'vitest/config'

const legacyTests = ['**/legacy-compat/__type-tests__/**']

export default defineProject({
  plugins: [
    // Standard (TC39 2022-03) decorators
    swc.vite({
      exclude: legacyTests,
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorVersion: '2022-03' },
      },
    }),
    // Legacy (experimentalDecorators) type tests
    swc.vite({
      include: legacyTests,
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: false },
      },
    }),
  ],
  test: {
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.typecheck.json',
    },
    include: [
      'src/**/*.spec.mts',
      'src/**/*.spec-d.mts',
      'src/legacy-compat/__type-tests__/**/*.spec-d.mts',
    ],
  },
})
