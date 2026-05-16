import { withFilter } from 'rolldown/filter'
import { defineConfig } from 'tsdown'
import swc from 'unplugin-swc'

export default defineConfig({
  entry: ['src/index.mts'],
  outDir: 'lib',
  format: ['esm', 'cjs'],
  clean: true,
  tsconfig: 'tsconfig.lib.json',
  treeshake: true,
  sourcemap: true,
  platform: 'node',
  // `bun` is a runtime-provided module whose types ship as ambient `@types/bun`
  // (`BunRequest`/`Server`/`Serve` are type-only exports). It must stay external
  // so the dts bundler does not try to resolve it as a value module.
  external: ['bun'],
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
