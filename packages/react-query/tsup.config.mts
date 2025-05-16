import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.mts'],
  outDir: 'lib',
  format: ['esm', 'cjs'],
  clean: true,
  treeshake: 'smallest',
  sourcemap: true,
  platform: 'node',
  experimentalDts: true,
})
