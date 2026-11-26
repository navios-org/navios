import { keyOf } from '../internal/args-key.mjs'
import { EntryStatus } from '../internal/entry.mjs'
import { finalToken, followAlias, requireToken } from '../internal/lookup.mjs'
import { ANY_ARGS } from '../internal/store.mjs'
import { validateSync } from '../schema/standard-schema.mjs'
import { BoundInjectionToken, FactoryInjectionToken } from '../token/injection-token.mjs'

import type { RootHost } from '../internal/host.mjs'
import type { Store } from '../internal/store.mjs'
import type { AnyInjectableType, InjectionToken } from '../token/injection-token.mjs'

// Listens for the instance of `raw` / `args`, in the store that `storeFor`
// says would hold it. For an alias that is the instance it points to, and one
// that was added for the alias itself.
export function addInvalidateListener(
  root: RootHost,
  storeFor: (token: InjectionToken<any, any>) => Store,
  raw: AnyInjectableType,
  args: unknown,
  listener: () => void,
): () => void {
  const listen = (token: AnyInjectableType, base: InjectionToken<any, any>) =>
    storeFor(base).addListener(base, addressOf(root, token, base, args), listener)

  const own = requireToken(raw)
  const final = finalToken(root, raw)
  const removeOwn = listen(raw, own)
  if (final === undefined || final === own) {
    return removeOwn
  }
  const removeFinal = listen(followAlias(root, raw), final)
  return () => {
    removeOwn()
    removeFinal()
  }
}

function addressOf(
  root: RootHost,
  token: AnyInjectableType,
  base: InjectionToken<any, any>,
  args: unknown,
): string | null {
  if (token instanceof BoundInjectionToken) {
    return keyFor(base, token.value)
  }
  if (token instanceof FactoryInjectionToken) {
    const value = root.factoryValues.get(token)
    // Until the factory has produced the args, the instance cannot be
    // addressed, so listen for any instance of the underlying token.
    return value?.status === EntryStatus.Ready ? keyFor(base, value.instance) : ANY_ARGS
  }
  return keyFor(base, args)
}

function keyFor(token: InjectionToken<any, any>, args: unknown): string | null {
  let value = args
  if (token.schema !== undefined) {
    try {
      value = validateSync(token.schema, args, token.toString())
    } catch {
      // Listen under the raw args; nothing will be stored there, which is the
      // same as the instance never existing.
    }
  }
  return keyOf(value)
}
