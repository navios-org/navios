/**
 * Compiles `ignoreRoutes` patterns into one test. `*` matches any run of
 * characters; everything else is literal.
 */
export function compileIgnoreRoutes(
  patterns: readonly string[],
): ((path: string) => boolean) | null {
  if (patterns.length === 0) {
    return null
  }
  const exact = new Set<string>()
  const globs: RegExp[] = []
  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      const source = pattern
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')
      globs.push(new RegExp(`^${source}$`))
    } else {
      exact.add(pattern)
    }
  }
  return (path) => exact.has(path) || globs.some((glob) => glob.test(path))
}
