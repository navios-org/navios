import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.mts',
    socket: 'src/socket/index.mts',
    eventsource: 'src/eventsource/index.mts',
  },
  outDir: 'lib',
  format: ['esm', 'cjs'],
  clean: true,
  treeshake: true,
  sourcemap: true,
  platform: 'neutral',
  fixedExtension: true,
  dts: true,
  target: 'es2022',
})
