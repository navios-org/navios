import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.mts'],
  outDir: 'lib',
  format: ['esm', 'cjs'],
  clean: true,
  treeshake: true,
  sourcemap: true,
  platform: 'browser',
  // Without it a browser build names the CommonJS file `index.js`, which the
  // package.json does not point at.
  fixedExtension: true,
  dts: true,
  target: 'es2022',
  external: ['react', '@navios/di'],
})
