import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { runInNewContext } from 'node:vm'

import { build } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Format, Platform } from 'esbuild'

const run = promisify(execFile)
const source = fileURLToPath(new URL('../index.mts', import.meta.url))

const app = `
  import { Container, inject, registerInjectable } from ${JSON.stringify(source)}
  class A {}
  registerInjectable(A)
  class B { a = inject(A) }
  registerInjectable(B)
  console.log(new Container().getSync(B).a instanceof A)
`

/** An app that uses the container, as esbuild bundles it. */
async function bundle(contents: string, format: Format, platform: Platform): Promise<string> {
  const { outputFiles } = await build({
    stdin: { contents, resolveDir: dirname(source), loader: 'js' },
    bundle: true,
    write: false,
    format,
    platform,
    target: 'es2022',
    logLevel: 'error',
  })
  return outputFiles[0].text
}

describe('a bundle of the package', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'navios-di-bundle-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true })
  })

  async function runFile(name: string, code: string) {
    const file = join(directory, name)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, code)
    return run(process.execPath, [file])
  }

  it.each<[Format, string]>([
    ['cjs', 'app.cjs'],
    ['iife', 'app.cjs'],
    ['esm', 'app.mjs'],
  ])('runs in Node.js as %s', async (format, name) => {
    const { stdout, stderr } = await runFile(name, await bundle(app, format, 'node'))
    expect(stdout).toBe('true\n')
    expect(stderr).toBe('')
  })

  // No `process`, no `require()` and no `__filename`.
  it.each<[Format]>([['cjs'], ['iife']])('runs in a browser as %s', async (format) => {
    const log = vi.fn()
    const warn = vi.fn()
    const module = { exports: {} }
    runInNewContext(await bundle(app, format, 'browser'), {
      console: { log, warn },
      module,
      exports: module.exports,
    })
    expect(log).toHaveBeenCalledExactlyOnceWith(true)
    expect(warn).not.toHaveBeenCalled()
  })

  it('holds nothing a script or a browser cannot parse or lacks', async () => {
    // Bun leaves `import.meta` in a script, where it is a syntax error.
    const code = await bundle(app, 'esm', 'browser')
    expect(code).not.toMatch(/import\.meta|__filename|__dirname|\brequire\(/)
  })

  it('is no second copy for another bundle', async () => {
    await runFile('one.mjs', await bundle(app, 'esm', 'node'))
    await runFile('two.cjs', await bundle(app, 'cjs', 'node'))
    const { stdout, stderr } = await runFile('main.mjs', `import './one.mjs'; import './two.cjs';`)
    expect(stdout).toBe('true\ntrue\n')
    expect(stderr).toBe('')
  })

  it.each([
    [
      'two places',
      'a/node_modules/@navios/di/lib/index.mjs',
      'b/node_modules/@navios/di/lib/index.mjs',
    ],
    [
      'two formats',
      'node_modules/@navios/di/lib/index.mjs',
      'node_modules/@navios/di/lib/index.cjs',
    ],
  ])('is told from an installed copy, and two copies in %s are noticed', async (_, one, two) => {
    const entry = `export * from ${JSON.stringify(source)}`
    await runFile(one, await bundle(entry, 'esm', 'node'))
    await runFile(two, await bundle(entry, two.endsWith('.cjs') ? 'cjs' : 'esm', 'node'))
    const { stderr } = await runFile('main.mjs', `import './${one}'; import './${two}'`)
    expect(stderr).toContain('@navios/di is loaded more than once')
    expect(stderr).toContain(one)
    expect(stderr).toContain(two)
    const alone = await runFile('alone.mjs', `import './${one}'; import './${one}?t=1'`)
    expect(alone.stderr).toBe('')
  })
})
