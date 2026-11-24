import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.mts', 'src/testing/index.mts', 'src/legacy-compat/index.mts'],
  outDir: 'lib',
  format: ['esm', 'cjs'],
  clean: true,
  treeshake: true,
  sourcemap: true,
  platform: 'node',
  dts: true,
  target: 'es2022',
  outputOptions: {
    // Keeps the `Symbol.metadata` polyfill in a chunk of its own, under a name
    // the `sideEffects` list of package.json can match.
    codeSplitting: {
      groups: [{ name: 'symbol-metadata', test: /symbol-metadata\.mts$/ }],
    },
  },
})
