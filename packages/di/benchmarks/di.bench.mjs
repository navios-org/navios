/**
 * Per-operation cost of the container, next to building the same object by
 * hand. Runs against the built output:
 *
 *   yarn turbo run build --filter=@navios/di && yarn bench
 *
 * Budgets from docs/plans/2026-11-24-navios-2-0-framework-design.md, section 11
 * (the 1.x numbers were measured on the same machine before the rewrite):
 *
 *   get of a ready singleton              1.x 0.39 µs   budget: not slower
 *   get transient, 1 ready dependency     1.x 4.7 µs    budget: 1.2 µs
 *   scope + request-scoped get + dispose  1.x 5.6 µs    budget: 1.5 µs
 *
 * Pass --check to exit non-zero when a budget is exceeded.
 */
import { performance } from 'node:perf_hooks'

import { Container, inject, InjectableScope, registerInjectable } from '../lib/index.mjs'

class Dep {
  value = 1
}
registerInjectable(Dep)

class Dep2 {
  value = 2
}
registerInjectable(Dep2)

class Singleton {
  a = inject(Dep)
  b = inject(Dep2)
}
registerInjectable(Singleton)

class PerRequest {
  a = inject(Dep)
  b = inject(Dep2)
}
registerInjectable(PerRequest, { scope: InjectableScope.Request })

class Transient {
  a = inject(Dep)
}
registerInjectable(Transient, { scope: InjectableScope.Transient })

const container = new Container()
const dep = container.getSync(Dep)
const dep2 = container.getSync(Dep2)
container.getSync(Singleton)
const longLivedScope = container.createScope()

const results = []

function record(name, micros, budget) {
  results.push({ name, micros, budget })
  const verdict =
    budget === undefined ? '' : micros <= budget ? '  ok' : `  OVER BUDGET (${budget})`
  console.log(`${name.padEnd(66)} ${micros.toFixed(3)} µs/op${verdict}`)
}

function sync(name, fn, budget, iterations = 2_000_000) {
  for (let i = 0; i < 100_000; i++) fn()
  let best = Infinity
  for (let round = 0; round < 5; round++) {
    const start = performance.now()
    for (let i = 0; i < iterations; i++) fn()
    best = Math.min(best, ((performance.now() - start) * 1000) / iterations)
  }
  record(name, best, budget)
}

async function async_(name, fn, budget, iterations = 500_000) {
  for (let i = 0; i < 50_000; i++) await fn()
  let best = Infinity
  for (let round = 0; round < 5; round++) {
    const start = performance.now()
    for (let i = 0; i < iterations; i++) await fn()
    best = Math.min(best, ((performance.now() - start) * 1000) / iterations)
  }
  record(name, best, budget)
}

console.log(`node ${process.version}, NODE_ENV=${process.env.NODE_ENV ?? ''}\n`)

sync('baseline: build { a, b } by hand', () => ({ a: dep, b: dep2 }))
await async_('baseline: one await', async () => {
  await Promise.resolve()
})

sync('getSync(ready singleton)', () => container.getSync(Singleton))
await async_('await get(ready singleton)', () => container.get(Singleton), 0.39)
await async_('await scope.get(ready singleton)', () => longLivedScope.get(Singleton))

sync('getSync(transient, 1 dep)', () => container.getSync(Transient))
await async_('await get(transient, 1 dep)', () => container.get(Transient), 1.2)

sync('createScope + dispose, nothing resolved', () => {
  void container.createScope().dispose()
})
sync('createScope + getSync(request-scoped, 2 deps) + dispose', () => {
  const scope = container.createScope()
  scope.getSync(PerRequest)
  void scope.dispose()
})
await async_(
  'createScope + await get(request-scoped, 2 deps) + await dispose',
  async () => {
    const scope = container.createScope()
    await scope.get(PerRequest)
    await scope.dispose()
  },
  1.5,
)

if (process.argv.includes('--check')) {
  const over = results.filter((r) => r.budget !== undefined && r.micros > r.budget)
  if (over.length > 0) {
    console.error(`\n${over.length} benchmark(s) over budget`)
    process.exit(1)
  }
}
