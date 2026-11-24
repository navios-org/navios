import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.mts', 'src/legacy-compat/index.mts'],
  outDir: 'lib',
  format: ['esm', 'cjs'],
  clean: true,
  tsconfig: 'tsconfig.lib.json',
  treeshake: true,
  sourcemap: true,
  platform: 'node',
  external: ['@navios/core', '@navios/core/legacy-compat', '@navios/di'],
  dts: true,
  target: 'es2022',
})
