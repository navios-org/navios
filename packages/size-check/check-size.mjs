/**
 * Fails when the published ESM output of a framework package grows past its
 * budget, or contains something it must never contain.
 *
 * Budgets are the size at the 2.0 rewrite plus roughly 15% headroom. Raise
 * one deliberately, in the same change that needs it, and say why in the
 * commit.
 *
 * Forbidden content:
 * - `_apply_decs`: the decorator helper SWC inlines once per decorated class.
 *   These packages register their classes with `registerInjectable`, so the
 *   helper appearing means decorator syntax crept back into the sources.
 * - an import of `zod`: schemas are Standard Schemas; no vendor is bundled or
 *   required at runtime.
 * - `node:async_hooks` in `@navios/di`: it must load in a browser.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packagesDir = join(dirname(fileURLToPath(import.meta.url)), '..')

const ZOD_IMPORT = /from\s*["']zod(\/[^"']*)?["']|require\(["']zod(\/[^"']*)?["']\)/

/** An import of the HTTP layer or of the endpoint builder. */
const HTTP_IMPORT = /(from\s*|require\()["']@navios\/(server|builder)/

const targets = [
  { name: 'di', budget: 88_000, forbidden: [/_apply_decs/, ZOD_IMPORT, /node:async_hooks/] },
  // No HTTP in core: none of its files may import the server or the builder.
  {
    name: 'core',
    budget: 95_000,
    forbidden: [/_apply_decs/, ZOD_IMPORT, HTTP_IMPORT],
  },
  { name: 'server', budget: 138_000, forbidden: [/_apply_decs/, ZOD_IMPORT] },
  { name: 'adapter-fastify', budget: 19_000, forbidden: [/_apply_decs/, ZOD_IMPORT] },
  { name: 'adapter-bun', budget: 22_000, forbidden: [/_apply_decs/, ZOD_IMPORT] },
]

/** Top-level ESM files: the main entry and the chunks it shares with subpaths. */
function esmFiles(lib) {
  return readdirSync(lib)
    .filter((file) => file.endsWith('.mjs'))
    .map((file) => join(lib, file))
}

let failed = false

for (const { name, budget, forbidden } of targets) {
  const lib = join(packagesDir, name, 'lib')
  let files
  try {
    files = esmFiles(lib)
  } catch {
    console.error(`✖ @navios/${name}: no build output at ${lib}. Run the build first.`)
    failed = true
    continue
  }
  if (files.length === 0) {
    console.error(`✖ @navios/${name}: no .mjs files in ${lib}`)
    failed = true
    continue
  }

  const size = files.reduce((total, file) => total + statSync(file).size, 0)
  const kb = (bytes) => `${(bytes / 1000).toFixed(1)} kB`
  if (size > budget) {
    console.error(`✖ @navios/${name}: ${kb(size)} is over the ${kb(budget)} budget`)
    failed = true
  } else {
    console.log(`✔ @navios/${name}: ${kb(size)} of ${kb(budget)}`)
  }

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const pattern of forbidden) {
      if (pattern.test(source)) {
        console.error(`✖ @navios/${name}: ${file} matches ${pattern}`)
        failed = true
      }
    }
  }
}

process.exit(failed ? 1 : 0)
