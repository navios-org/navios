import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.mts'],
  outDir: 'lib',
  format: ['esm', 'cjs'],
  clean: true,
  sourcemap: true,
  platform: 'neutral',
  experimentalDts: true,
})
