import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.mts'],
  outDir: 'lib',
  format: ['esm', 'cjs'],
  clean: true,
  treeshake: true,
  sourcemap: true,
  platform: 'browser',
  dts: true,
  target: 'es2022',
  external: ['react', '@navios/di'],
})
