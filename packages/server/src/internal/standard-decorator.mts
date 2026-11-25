/**
 * Fails with the fix when a standard decorator is applied by a compiler that
 * runs with `experimentalDecorators`: it is then called without the context
 * object (a class decorator) or with a property name in its place (a member
 * decorator), and would fail on reading the context instead.
 * @internal
 */
export function assertStandardDecorator(name: string, context: unknown): void {
  if (typeof context !== 'object' || context === null) {
    throw new Error(
      `[Navios] @${name} was applied as a legacy decorator ("experimentalDecorators": true). ` +
        `Import it from '@navios/server/legacy-compat', or turn "experimentalDecorators" off.`,
    )
  }
}
