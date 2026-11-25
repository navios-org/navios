/**
 * Runs before `yarn npm publish`, which tags a release `latest`. A prerelease
 * must not become what `npm install` gives everyone, so it is refused here;
 * `publish:next` is the way to publish one.
 */
import { readFileSync } from 'node:fs'

const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'))

if (version.includes('-')) {
  console.error(
    `✖ ${name}@${version} is a prerelease and would be tagged "latest". Use publish:next instead.`,
  )
  process.exit(1)
}
