import { DIError } from '../errors/di-error.mjs'
import { argsKey } from '../internal/args-key.mjs'
import { baseToken } from '../internal/normalize.mjs'
import { ANY_ARGS } from '../internal/store.mjs'
import { validateSync } from '../schema/standard-schema.mjs'
import { BoundInjectionToken, FactoryInjectionToken } from '../token/injection-token.mjs'

import type { RootHost } from '../internal/host.mjs'
import type { Store } from '../internal/store.mjs'
import type { ClassType } from '../token/class-type.mjs'
import type { AnyInjectableType, InjectionToken } from '../token/injection-token.mjs'

/** @internal */
export function addInvalidateListener(
  root: RootHost,
  store: Store,
  token: AnyInjectableType,
  args: unknown,
  listener: () => void,
): () => void {
  const base = baseToken(token)
  if (base === undefined) {
    throw DIError.classNotInjectable((token as ClassType).name)
  }
  if (token instanceof BoundInjectionToken) {
    return store.addListener(base, keyFor(base, token.value), listener)
  }
  if (token instanceof FactoryInjectionToken) {
    const state = root.factoryValues.get(token)
    // Until the factory has produced the args, the instance cannot be
    // addressed, so listen for any instance of the underlying token.
    return store.addListener(
      base,
      state?.done === true ? keyFor(base, state.value) : ANY_ARGS,
      listener,
    )
  }
  return store.addListener(base, keyFor(base, args), listener)
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
  return value === undefined ? null : argsKey(value)
}
