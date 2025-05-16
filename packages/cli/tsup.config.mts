import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/bin.ts'],
  outDir: 'lib',
  format: ['esm'],
  clean: true,
  treeshake: 'smallest',
  sourcemap: true,
  platform: 'node',
  experimentalDts: true,
})
