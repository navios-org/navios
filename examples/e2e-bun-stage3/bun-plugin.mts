import fs from 'fs'

import { plugin } from 'bun'
import chalk from 'chalk'

// 0. minor setup
let totalTimeSpentTranspiling = 0
const RELOAD_HACK_FILENAME = 'bunPlugin.reload.ts'

const startSetup = Date.now()
const log = (str: string): void => console.log(chalk.dim(`[bun] ${str}`))
log(`evaluating plugin module`)

plugin({
  name: 'typescript-with-native-decorators',
  setup(build): void {
    // 1. watch files manually since --watch is broken when using bun plugin
    const folderToWatch = import.meta.dir + '/src/'
    log(`manually watching ${folderToWatch}`)
    const watchFileSet = new Set<string | null>()
    fs.watch(folderToWatch, { recursive: true }, (event, filename) => {
      const needestart = watchFileSet.has(filename)
      log(`file ${filename} changed (in set: ${watchFileSet.has(filename)})`)
      if (needestart)
        void Bun.file(`./${RELOAD_HACK_FILENAME}`).write(
          `// '${Math.random()})\n`,
        )
    })

    // 2. change how .ts and .tsx files are loaded
    log(`setup took ${Date.now() - startSetup}ms`)
    const filter = /.*\.m?(ts|tsx)$/
    build.onLoad(
      { filter },
      async (args): Promise<{ loader: 'js'; contents: string }> => {
        try {
          watchFileSet.add(args.path.replace(folderToWatch, ''))
          const codeTs = await Bun.file(args.path).text()
          const startTranspiling = performance.now()
          let codeJS = await transpileFile(args.path, codeTs)

          totalTimeSpentTranspiling += performance.now() - startTranspiling
          addToCache(codeTs, codeJS)
          return { loader: 'js', contents: codeJS }
        } catch (e) {
          console.log(`[error] `, e)
          return { contents: '', loader: 'js' }
        }
      },
    )
  },
})

// 4. cache system
const oldCache: Map<string, string> = (await Bun.file(
  './bunPlugin.cache',
).exists())
  ? new Map(JSON.parse((await Bun.file('./bunPlugin.cache').text()) || '[]'))
  : new Map()

const cache = new Map<string, string>()
log(`restoring module with ${oldCache.size} entries`)

export const getFromCache = (content: string): string | undefined => {
  if (cache.has(content)) return cache.get(content)
  if (oldCache.has(content)) {
    const value = oldCache.get(content)
    if (value) cache.set(content, value)
    return value
  }
  return
}

export function debounce<F extends (...args: any[]) => void>(
  func: F,
  waitFor: number,
) {
  let timeout: ReturnType<typeof setTimeout> | null = null

  const debounced = (...args: Parameters<F>) => {
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => func(...args), waitFor)
  }

  return debounced as (...args: Parameters<F>) => void
}

const saveCacheImpl = debounce(() => {
  log(`saving cache with ${cache.size} entries (spent ${totalTimeSpentTranspiling.toFixed(2)}ms transpiling)`)
  void Bun.file('./bunPlugin.cache').write(JSON.stringify([...cache.entries()]))
}, 50)

export const addToCache = (codeTS: string, codeJS: string): void => {
  cache.set(codeTS, codeJS)
  saveCacheImpl()
}

async function transpileFile(name: string, codeTs: string): Promise<string> {
  // 1. try to return the cached version
  const cached = getFromCache(codeTs)
  if (cached) return cached

  // or transpile a new
  const codeJs = await transpileFileWithEsbuild(name, codeTs)
  addToCache(codeTs, codeJs)
  return codeJs
}

// Use esbuild to transpile TypeScript with decorators
async function transpileFileWithEsbuild(
  name: string,
  file: string,
): Promise<string> {
  const esbuild = (await import('esbuild')).default
  const result = await esbuild.transform(file, {
    loader: 'ts',
    target: 'chrome110',
  })
  return result.code
}
