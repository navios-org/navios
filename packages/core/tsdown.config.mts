import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.mts',
    'src/transport.mts',
    'src/testing/index.mts',
    'src/legacy-compat/index.mts',
  ],
  outDir: 'lib',
  format: ['esm', 'cjs'],
  clean: true,
  tsconfig: 'tsconfig.lib.json',
  treeshake: true,
  sourcemap: true,
  platform: 'node',
  external: ['@navios/di', '@navios/di/internal', '@navios/di/legacy-compat'],
  dts: true,
  target: 'es2022',
})
