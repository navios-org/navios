/**
 * Fails when a URL the site has ever published stops resolving in a build.
 *
 * Usage: node scripts/check-urls.mts <buildDir>
 *
 * A path resolves when `<buildDir>/<path>/index.html` exists, which serves both `/x` and `/x/`
 * on GitHub Pages and every other static host.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { renamedPages } from './renamed-pages.mts'

const siteUrl = 'https://navios.tech'
const stubMarker = '<meta name="navios-redirect"'

const buildDir = process.argv[2]
if (!buildDir) {
  console.error('Usage: node scripts/check-urls.mts <buildDir>')
  process.exit(2)
}

const baseline = readFileSync(join(import.meta.dirname, 'url-baseline.txt'), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)

/**
 * Returns the file a static host serves for a published path, with or without a trailing slash.
 * Only directory indexes count: hosts disagree on `x.html` when `x/` also exists.
 */
function resolve(publicPath: string): string | undefined {
  const index = join(buildDir, publicPath, 'index.html')
  return existsSync(index) ? index : undefined
}

const failures: string[] = []

if (!existsSync(join(buildDir, 'CNAME'))) failures.push('CNAME is missing from the build root')

for (const path of baseline) {
  const file = resolve(path)
  if (!file) {
    failures.push(`${path} does not resolve`)
    continue
  }
  if (path !== '/' && existsSync(join(buildDir, `${path}.html`))) {
    failures.push(`${path} exists as both ${path}.html and ${path}/index.html`)
  }
  const html = readFileSync(file, 'utf8')
  const isStub = html.includes(stubMarker)
  const renamedTo = renamedPages[path]
  if (!renamedTo) {
    if (isStub) failures.push(`${path} is a redirect but should be a real page`)
    continue
  }
  if (!isStub) {
    failures.push(`${path} resolves but does not redirect to ${renamedTo}`)
    continue
  }
  const required = [
    `<link rel="canonical" href="${siteUrl}${renamedTo}">`,
    `<meta http-equiv="refresh" content="0; url=${renamedTo}">`,
    `location.replace(${JSON.stringify(renamedTo)} + location.search + location.hash)`,
  ]
  for (const snippet of required) {
    if (!html.includes(snippet)) failures.push(`${path} redirect is missing: ${snippet}`)
  }
}

if (failures.length > 0) {
  console.error(`${failures.length} URL check(s) failed:`)
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}

console.log(`All ${baseline.length} published paths resolve in ${buildDir}`)
