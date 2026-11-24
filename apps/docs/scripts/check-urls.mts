/**
 * Fails when a URL the site has ever published stops resolving in a build.
 *
 * Usage: node scripts/check-urls.mts <buildDir>
 *
 * Resolution follows GitHub Pages: `/x` is served by `x.html` or `x/index.html`,
 * `/x/` only by `x/index.html`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { renamedPages } from './renamed-pages.mts'

const buildDir = process.argv[2]
if (!buildDir) {
  console.error('Usage: node scripts/check-urls.mts <buildDir>')
  process.exit(2)
}

const baseline = readFileSync(join(import.meta.dirname, 'url-baseline.txt'), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)

/** Returns the file GitHub Pages would serve for a public path, if any. */
function resolve(publicPath: string): string | undefined {
  if (publicPath === '/') {
    const index = join(buildDir, 'index.html')
    return existsSync(index) ? index : undefined
  }
  const trailingSlash = publicPath.endsWith('/')
  const bare = publicPath.replace(/\/$/, '')
  const candidates = trailingSlash
    ? [join(buildDir, bare, 'index.html')]
    : [join(buildDir, `${bare}.html`), join(buildDir, bare, 'index.html')]
  return candidates.find((file) => existsSync(file))
}

const failures: string[] = []

if (!existsSync(join(buildDir, 'CNAME'))) failures.push('CNAME is missing from the build root')

for (const path of baseline) {
  const forms = path === '/' ? ['/'] : [path, `${path}/`]
  for (const form of forms) {
    const file = resolve(form)
    if (!file) {
      failures.push(`${form} does not resolve`)
      continue
    }
    const target = renamedPages[path]
    if (target && !readFileSync(file, 'utf8').includes(target)) {
      failures.push(`${form} resolves but does not redirect to ${target}`)
    }
  }
}

if (failures.length > 0) {
  console.error(`${failures.length} URL check(s) failed:`)
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}

console.log(`All ${baseline.length} published paths resolve in ${buildDir}`)
