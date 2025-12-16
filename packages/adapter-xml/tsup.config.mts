import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.mts',
    'src/jsx-runtime.mts',
    'src/jsx-dev-runtime.mts',
    'src/jsx.mts',
  ],
  outDir: 'lib',
  format: ['esm', 'cjs'],
  clean: true,
  tsconfig: 'tsconfig.lib.json',
  treeshake: 'smallest',
  sourcemap: true,
  platform: 'node',
  experimentalDts: true,
})
