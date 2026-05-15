import { getInjections, InjectionKind } from '../../decorators/injection-metadata.mjs'
import { InjectableScope } from '../../enums/index.mjs'
import { DIError } from '../../errors/index.mjs'

import type { Registry } from '../../token/registry.mjs'
import type { ClassType } from '../../token/token.mjs'
import type { TokenResolver } from './token-resolver.mjs'

/**
 * Per-class memo: a class is recorded here only after it has completed a
 * successful Singleton scope-compatibility walk, so subsequent resolutions of
 * the same class skip the walk entirely. Steady-state cost is therefore zero.
 *
 * Only the post-successful-walk Singleton case is memoized — a class that
 * throws never reaches the memo write (so a misconfigured service fails fast
 * on every attempt, and a later registry change that fixes the dep is
 * re-evaluated), and non-Singleton hosts early-return without a memo write
 * (the very next call is an O(1) early-return anyway).
 */
const validated = new WeakMap<ClassType, true>()

/**
 * Fail-fast scope compatibility check (v2 replacement for the deleted runtime
 * scope-upgrade / `ScopeTracker`).
 *
 * At first resolution of a class, walk its `@Inject*` metadata and, for each
 * EAGER dependency (`@Inject` / `@InjectDerived`), look up the dependency's
 * registered scope. A Singleton host that eagerly depends on a Request- or
 * Transient-scoped service is a scope-coupling bug (the dep would either
 * outlive its request or be silently shared across constructions) — throw a
 * clear {@link DIError} instead of the v1 silent demotion.
 *
 * Skipped (never a false positive):
 * - `@InjectLazy` — deferred resolution breaks the scope coupling.
 * - `@InjectOptional` — null-safe; the field tolerates absence.
 * - Unregistered deps — not a scope problem; the normal not-found error
 *   surfaces at resolution time.
 * - Non-Singleton hosts, and Singleton→Singleton — all valid.
 */
export function validateScopeCompatibility(
  target: ClassType,
  hostScope: InjectableScope,
  registry: Registry,
  tokenResolver: TokenResolver,
): void {
  if (validated.has(target)) {
    return
  }

  // Only a Singleton host can be over-scoped by an eager shorter-lived dep.
  // Request/Transient hosts may eagerly hold deps of any scope.
  //
  // INVARIANT: this early-return MUST stay above the `validated.set(target,
  // true)` memo write below. `ScopedContainer.resolveInScope` resolves a
  // Singleton-declared class with a FORCED Request host scope; that path
  // reaches here as a non-Singleton host and returns BEFORE the per-class
  // memo is recorded. Moving this below the memo write would cache the class
  // as globally-validated off a forced-scope resolution, corrupting the
  // later real Singleton-scope fail-fast for the same class.
  if (hostScope !== InjectableScope.Singleton) {
    return
  }

  for (const entry of getInjections(target)) {
    if (
      entry.kind !== InjectionKind.Eager &&
      entry.kind !== InjectionKind.Derived
    ) {
      // Lazy / Optional — always OK.
      continue
    }

    let depToken
    try {
      depToken = tokenResolver.getRegistryToken(entry.token as any)
    } catch {
      // Token could not be normalized to a registry token — not a scope
      // problem; let the normal resolution path surface the real error.
      continue
    }

    if (!registry.has(depToken)) {
      // Unregistered dep — not a scope problem; the normal not-found error
      // path applies at resolution time.
      continue
    }

    const depScope = registry.get(depToken).scope
    if (
      depScope === InjectableScope.Request ||
      depScope === InjectableScope.Transient
    ) {
      const rawName = depToken.name
      const depName =
        typeof rawName === 'function'
          ? rawName.name
          : (rawName?.toString() ?? String(entry.token))
      throw DIError.scopeMismatch(target.name, depName, hostScope, depScope)
    }
  }

  validated.set(target, true)
}
