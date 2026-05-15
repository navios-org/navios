import { withFilter } from 'rolldown/filter'
import { defineConfig } from 'tsdown'
import swc from 'unplugin-swc'

export default defineConfig([
  // Node.js build (default)
  {
    entry: ['src/index.mts', 'src/testing/index.mts'],
    outDir: 'lib',
    format: ['esm', 'cjs'],
    clean: true,
    treeshake: true,
    sourcemap: true,
    platform: 'node',
    external: ['node:async_hooks', 'zod'],
    dts: true,
    target: 'es2022',
    plugins: [
      withFilter(
        swc.rolldown({
          jsc: {
            target: 'es2022',
            parser: {
              syntax: 'typescript',
              decorators: true,
            },
            transform: {
              decoratorVersion: '2022-03',
            },
          },
        }),
        // Only run this transform if the file contains a decorator.
        { transform: { code: '@' } },
      ),
    ],
  },
  // Browser build - uses SyncLocalStorage and skips async_hooks entirely
  {
    entry: {
      index: 'src/index.mts',
    },
    outDir: 'lib',
    format: ['esm'],
    treeshake: true,
    sourcemap: true,
    platform: 'browser',
    external: ['zod'],
    dts: true,
    target: 'es2022',
    outputOptions(options) {
      return {
        ...options,
        dir: 'lib/browser',
        preserveModules: true,
        preserveModulesRoot: 'src',
      }
    },
    inputOptions(options) {
      return {
        ...options,
        resolve: {
          ...options.resolve,
          alias: {
            './async-local-storage.mjs': './async-local-storage.browser.mjs',
          },
        },
      }
    },
    plugins: [
      withFilter(
        swc.rolldown({
          jsc: {
            target: 'es2022',
            parser: {
              syntax: 'typescript',
              decorators: true,
            },
            transform: {
              decoratorVersion: '2022-03',
            },
          },
        }),
        // Only run this transform if the file contains a decorator.
        { transform: { code: '@' } },
      ),
    ],
  },
])
