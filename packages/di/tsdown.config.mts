import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.mts',
    'src/internal/index.mts',
    'src/testing/index.mts',
    'src/legacy-compat/index.mts',
  ],
  outDir: 'lib',
  format: ['esm', 'cjs'],
  clean: true,
  treeshake: true,
  sourcemap: true,
  platform: 'node',
  dts: true,
  target: 'es2022',
  outputOptions: {
    codeSplitting: {
      groups: [
        // The `Symbol.metadata` polyfill in a chunk of its own, under a name
        // the `sideEffects` list of package.json can match.
        { name: 'symbol-metadata', test: /symbol-metadata\.mts$/ },
        // The engine in one chunk: it reads module variables on every
        // injection, which is slower across chunks.
        { name: 'container', test: /src\/(?!testing|legacy-compat).*(?<!index|\.d)\.mts$/ },
      ],
    },
  },
})
