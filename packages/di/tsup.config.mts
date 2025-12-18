import { defineConfig } from 'tsup'

export default defineConfig([
  // Node.js build (default)
  {
    entry: ['src/index.mts', 'src/testing/index.mts'],
    outDir: 'lib',
    format: ['esm', 'cjs'],
    clean: true,
    treeshake: 'smallest',
    sourcemap: true,
    platform: 'node',
    experimentalDts: true,
  },
  // Browser build - uses dedicated entry that forces SyncLocalStorage
  {
    entry: {
      'browser/index': 'src/browser.mts',
    },
    outDir: 'lib',
    format: ['esm'],
    treeshake: 'smallest',
    sourcemap: true,
    platform: 'browser',
    experimentalDts: true,
  },
])
