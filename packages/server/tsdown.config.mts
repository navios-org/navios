import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.mts',
    'src/adapter/index.mts',
    'src/testing/index.mts',
    'src/legacy-compat/index.mts',
    'src/conformance/index.mts',
  ],
  outDir: 'lib',
  format: ['esm', 'cjs'],
  clean: true,
  tsconfig: 'tsconfig.lib.json',
  treeshake: true,
  sourcemap: true,
  platform: 'node',
  external: [
    '@navios/core',
    '@navios/core/transport',
    '@navios/core/testing',
    '@navios/core/legacy-compat',
    '@navios/di',
    '@navios/di/legacy-compat',
    '@navios/builder',
  ],
  dts: { tsconfig: 'tsconfig.dts.json' },
  target: 'es2022',
})
