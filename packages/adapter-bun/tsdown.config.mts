import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.mts'],
  outDir: 'lib',
  format: ['esm', 'cjs'],
  clean: true,
  tsconfig: 'tsconfig.lib.json',
  treeshake: true,
  sourcemap: true,
  platform: 'node',
  dts: true,
  // 'bun' must stay external (the dts bundler cannot resolve it via @types/bun).
  external: ['bun'],
  target: 'es2022',
})
