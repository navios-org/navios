import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.mts'],
  outDir: 'lib',
  format: ['esm', 'cjs'],
  clean: true,
  tsconfig: 'tsconfig.lib.json',
  treeshake: 'smallest',
  sourcemap: true,
  platform: 'node',
  experimentalDts: true,
})
