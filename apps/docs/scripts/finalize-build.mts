/**
 * Post-build step: keeps every URL the site has published working on any static host.
 *
 * Rspress emits `x.html`. The previous site served each page from `x/index.html`, so `/x/` is what
 * people have bookmarked, and hosts disagree on what to serve when both `x.html` and `x/` exist.
 * This moves every page to `x/index.html`, which serves both `/x` and `/x/` everywhere, and writes
 * redirect pages for the paths listed in `renamed-pages.mts`. Existing files are never overwritten.
 *
 * Usage: node scripts/finalize-build.mts <buildDir>
 */
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

import { renamedPages } from './renamed-pages.mts'

const siteUrl = 'https://navios.tech'

const buildDir = process.argv[2]
if (!buildDir) {
  console.error('Usage: node scripts/finalize-build.mts <buildDir>')
  process.exit(2)
}

function stub(target: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="navios-redirect" content="${target}">
    <title>Redirecting…</title>
    <link rel="canonical" href="${siteUrl}${target}">
    <meta name="robots" content="noindex">
    <meta http-equiv="refresh" content="0; url=${target}">
    <script>location.replace(${JSON.stringify(target)} + location.search + location.hash)</script>
  </head>
  <body>
    <a href="${target}">This page has moved to ${target}</a>
  </body>
</html>
`
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return htmlFiles(path)
    return entry.name.endsWith('.html') ? [path] : []
  })
}

// Collect first, so files moved below are not themselves picked up.
const pages = htmlFiles(buildDir).filter((file) => !['index.html', '404.html'].includes(file.split(sep).at(-1)!))

for (const file of pages) {
  const target = join(file.replace(/\.html$/, ''), 'index.html')
  if (existsSync(target)) {
    console.error(`Cannot move ${relative(buildDir, file)}: ${relative(buildDir, target)} already exists`)
    process.exit(1)
  }
  mkdirSync(dirname(target), { recursive: true })
  renameSync(file, target)
}

let redirects = 0
for (const [from, to] of Object.entries(renamedPages)) {
  const file = join(buildDir, from, 'index.html')
  if (existsSync(file)) continue
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, stub(to))
  redirects += 1
}

console.log(`Moved ${pages.length} pages to directory indexes and wrote ${redirects} redirects in ${buildDir}`)
