/**
 * Warns when a second copy of this package is loaded into the process.
 *
 * Several things only work with one copy: `@Module` options that other
 * packages add by declaration merging, the async store behind
 * `currentContext()`, and `instanceof` checks on context keys. Two copies
 * usually mean two versions were installed, or one package bundled its own.
 */
const registryKey = Symbol.for('navios.core.copies')

interface Registry {
  locations: Set<string>
  warned: boolean
}

export function registerCopy(location: string, warn: (message: string) => void): void {
  const holder = globalThis as { [registryKey]?: Registry }
  const registry = (holder[registryKey] ??= { locations: new Set(), warned: false })
  if (registry.locations.has(location)) {
    // The same file evaluated again: a module reload, not a second copy.
    return
  }
  registry.locations.add(location)
  if (registry.locations.size > 1 && !registry.warned) {
    registry.warned = true
    warn(
      `[Navios] @navios/core is loaded more than once:\n` +
        [...registry.locations].map((entry) => `  - ${entry}`).join('\n') +
        `\nModule options, currentContext() and context keys are not shared between copies. ` +
        `Make sure every package resolves the same @navios/core (one version, not bundled).`,
    )
  }
}
