import { withFilter } from 'rolldown/filter'
import { defineConfig } from 'tsdown'
import swc from 'unplugin-swc'

export default defineConfig({
  entry: ['src/index.mts', 'src/jsx-runtime.mts', 'src/jsx-dev-runtime.mts', 'src/jsx.mts'],
  outDir: 'lib',
  format: ['esm', 'cjs'],
  clean: true,
  tsconfig: 'tsconfig.lib.json',
  treeshake: true,
  sourcemap: true,
  platform: 'node',
  dts: true,
  target: 'es2022',
  plugins: [
    withFilter(
      swc.rolldown({
        jsc: {
          target: 'es2022',
          parser: {
            syntax: 'typescript',
            decorators: true,
          },
          transform: {
            decoratorVersion: '2022-03',
          },
        },
      }),
      // Only run this transform if the file contains a decorator.
      { transform: { code: '@' } },
    ),
  ],
})
