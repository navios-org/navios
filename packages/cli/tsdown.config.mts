import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.mts', 'src/bin.mts'],
  outDir: 'lib',
  format: ['esm'],
  clean: true,
  treeshake: true,
  sourcemap: true,
  platform: 'node',
  dts: true,
  target: 'es2022',
})
