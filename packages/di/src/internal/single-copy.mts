const registryKey = Symbol.for('navios.di.copies')

interface Registry {
  locations: Set<string>
  warned: boolean
}

const ownFile = /^(?:file:|https?:|[\\/]|[a-z]:).*[\\/]di[\\/](?:lib|src)[\\/]/i

// The file this copy was loaded from, as the call stack has it; `undefined`
// where that does not tell, and in a bundle, which says nothing about the copy.
//
// In a bundle that is not a module `import.meta.url` is empty or a syntax error,
// which no check can come before, and `__filename` is missing in a browser.
function ownLocation(): string | undefined {
  const { prepareStackTrace } = Error
  try {
    Error.prepareStackTrace = (_, sites) => sites
    const [site] = new Error().stack as unknown as NodeJS.CallSite[]
    const file = String(site.getFileName())
    return ownFile.test(file) ? file : undefined
  } catch {
    return undefined
  } finally {
    Reflect.set(Error, 'prepareStackTrace', prepareStackTrace)
  }
}

/**
 * Warns when a second copy of this package is loaded into the process.
 *
 * `inject()` belongs to the copy it is imported from and knows nothing of a
 * construction that the container of another copy runs, and neither copy
 * recognises the tokens of the other. Two copies usually mean two versions
 * were installed, or one file is loaded with `import` and the other with
 * `require`.
 */
export function warnAboutSecondCopy(
  location: string | undefined = ownLocation(),
  warn: (message: string) => void = (message) => console.warn(message),
): void {
  if (location === undefined) {
    return
  }
  const holder = globalThis as { [registryKey]?: Registry }
  const registry = (holder[registryKey] ??= { locations: new Set(), warned: false })
  // The same file evaluated again, with or without a query that a development
  // server adds, is a module reload and not a second copy.
  registry.locations.add(location.replace(/[?#].*$/, ''))
  if (registry.locations.size > 1 && !registry.warned) {
    registry.warned = true
    warn(
      `[Navios] @navios/di is loaded more than once:\n` +
        [...registry.locations].map((entry) => `  - ${entry}`).join('\n') +
        `\nServices, tokens and inject() are not shared between copies. Make sure every package ` +
        `resolves the same @navios/di: one version, not bundled into another package, and not ` +
        `loaded with both import and require.`,
    )
  }
}
