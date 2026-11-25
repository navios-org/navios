import { misuse } from '../errors/create.mjs'

/**
 * Fails with the fix when a standard decorator is applied by a compiler that
 * runs with `experimentalDecorators`, which calls it without a context object
 * or, on a member, with the name of the member in its place.
 */
export function assertClassDecorator(name: string, context: unknown): void {
  if (typeof context !== 'object' || context === null) {
    throw misuse(
      `@${name} was applied as a legacy decorator ("experimentalDecorators": true). ` +
        `Import it from '@navios/di/legacy-compat', or turn "experimentalDecorators" off.`,
    )
  }
  if ((context as DecoratorContext).kind !== 'class') {
    throw misuse(`@${name} decorator can only be used on classes.`)
  }
}
