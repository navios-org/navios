/**
 * Checks that every file a published package's `exports`, `main`, `module`,
 * `types` and `typings` name is in the tarball `npm pack` would build. A
 * target outside `files` resolves in the workspace and is missing for every
 * user: 2.0.0-alpha.0 of `@navios/adapter-xml` shipped its `./jsx` types that
 * way. Run it after `yarn build`, since most targets are in `lib/`.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', 'packages')
let failed = false

for (const name of readdirSync(root)) {
  const dir = join(root, name)
  let pkg
  try {
    pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch {
    continue
  }
  if (pkg.private) {
    continue
  }
  const packed = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: dir,
    encoding: 'utf8',
  })
  const files = new Set(JSON.parse(packed)[0].files.map((file) => file.path))
  const targets = new Set()
  const collect = (value) => {
    if (typeof value === 'string') {
      targets.add(value.replace(/^\.\//, ''))
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(collect)
    }
  }
  collect(pkg.exports)
  for (const field of ['main', 'module', 'types', 'typings']) {
    collect(pkg[field])
  }
  const missing = [...targets].filter((target) => !target.includes('*') && !files.has(target))
  for (const target of missing) {
    console.error(`✖ ${pkg.name}: ${target} is not in the package`)
  }
  failed ||= missing.length > 0
}

if (failed) {
  process.exit(1)
}
console.log('✔ every export target is in its package')
