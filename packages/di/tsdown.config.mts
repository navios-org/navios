import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.mts'],
  outDir: 'lib',
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  platform: 'neutral',
})
