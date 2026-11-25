import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.mts', 'src/testing/index.mts'],
  outDir: 'lib',
  format: ['esm', 'cjs'],
  clean: true,
  treeshake: true,
  sourcemap: true,
  platform: 'neutral',
  fixedExtension: true,
  dts: true,
  target: 'es2022',
})
