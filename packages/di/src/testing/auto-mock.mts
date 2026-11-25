/**
 * Creates an auto-mock proxy that throws on method access.
 */
export function createAutoMockProxy(tokenId: string): object {
  return new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return undefined
        }
        if (typeof prop === 'symbol') {
          return undefined
        }
        throw new Error(
          `[UnitTestContainer] Attempted to access '${prop}' on auto-mocked service '${tokenId}'. ` +
            `This service is not in the providers list. ` +
            `Add it to providers, or set allowUnregistered: false to fail as soon as it is requested.`,
        )
      },
    },
  )
}
