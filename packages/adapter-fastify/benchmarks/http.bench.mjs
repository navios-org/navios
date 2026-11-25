/**
 * Per-request cost of Navios on Fastify, next to raw Fastify doing the same
 * validation by hand. Runs against built output:
 *
 *   yarn turbo run build --filter=@navios/adapter-fastify && yarn bench
 *
 * Budgets (overhead over raw Fastify, design section 11). The 1.x column was
 * measured on the same machine before the rewrite:
 *
 *   GET, response schema                          1.x +2.7 µs   budget +1.0 µs
 *   POST, query + body + response schema          1.x +1.7 µs   budget +1.0 µs
 *   GET with one guard                            1.x +3.5 µs   budget +1.5 µs
 *   GET reading one request value                 n/a           budget +1.3 µs
 *   GET using one request-scoped service (2 deps) 1.x +16.8 µs  budget +3.0 µs
 *
 * Pass --check to exit non-zero when a budget is exceeded.
 */
import { performance } from 'node:perf_hooks'

import {
  Controller,
  handler,
  inject,
  InjectableScope,
  Module,
  NaviosFactory,
  registerInjectable,
  registerRequestValue,
} from '@navios/server'
import { fastify } from 'fastify'
import { z } from 'zod/v4'

import { defineFastifyEnvironment } from '../lib/index.mjs'

const decorate = (target, decorator) => {
  decorator(target, { kind: 'class', name: target.name, metadata: {} })
  return target
}
const endpoint = (config) => ({ config })

const pingResponse = z.object({ ok: z.boolean() })
const userQuery = z.object({ q: z.string().optional() })
const userBody = z.object({ name: z.string(), age: z.number() })
const userResponse = z.object({ id: z.string(), name: z.string(), age: z.number() })

// ---------------------------------------------------------------- raw Fastify
async function buildRaw() {
  const app = fastify()
  app.get('/ping', async (_request, reply) => {
    reply.type('application/json; charset=utf-8')
    return JSON.stringify(pingResponse.parse({ ok: true }))
  })
  app.post('/users/:id', async (request, reply) => {
    userQuery.parse(request.query)
    const body = userBody.parse(request.body)
    reply.type('application/json; charset=utf-8')
    return JSON.stringify(
      userResponse.parse({ id: request.params.id, name: body.name, age: body.age }),
    )
  })
  await app.ready()
  return app
}

// --------------------------------------------------------------------- Navios
class Dep {}
registerInjectable(Dep)
class Dep2 {}
registerInjectable(Dep2)
class PerRequest {
  a = inject(Dep)
  b = inject(Dep2)
}
registerInjectable(PerRequest, { scope: InjectableScope.Request })

class Tenant {
  resolve(ctx) {
    return ctx.headers.get('x-tenant') ?? 'default'
  }
}
registerRequestValue(Tenant)

class AllowGuard {
  canActivate() {
    return true
  }
}
registerInjectable(AllowGuard)

async function buildNavios() {
  class PlainController {
    ping = handler(endpoint({ method: 'GET', url: '/ping', responseSchema: pingResponse }), () => ({
      ok: true,
    }))
    create = handler(
      endpoint({
        method: 'POST',
        url: '/users/$id',
        querySchema: userQuery,
        requestSchema: userBody,
        responseSchema: userResponse,
      }),
      ({ urlParams, data }) => ({ id: urlParams.id, name: data.name, age: data.age }),
    )
    value = handler(
      endpoint({ method: 'GET', url: '/value', responseSchema: pingResponse }),
      (_params, ctx) => ({ ok: ctx.get(Tenant) === 'default' }),
    )
    scoped = handler(
      endpoint({ method: 'GET', url: '/scoped', responseSchema: pingResponse }),
      (_params, ctx) => ({ ok: ctx.use(PerRequest) !== null }),
    )
  }
  decorate(PlainController, Controller())

  class GuardedController {
    guarded = handler(
      endpoint({ method: 'GET', url: '/guarded', responseSchema: pingResponse }),
      () => ({ ok: true }),
    )
  }
  decorate(GuardedController, Controller({ guards: [AllowGuard] }))

  class AppModule {}
  decorate(AppModule, Module({ controllers: [PlainController, GuardedController] }))

  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment(),
    logger: false,
    requestScopedServices: 'allow',
  })
  await app.init()
  return app.getServer()
}

// ------------------------------------------------------------------- measuring
async function measure(server, request, iterations = 20_000) {
  const check = await server.inject(request)
  if (check.statusCode !== 200) {
    throw new Error(`${request.method} ${request.url}: ${check.statusCode} ${check.body}`)
  }
  for (let i = 0; i < 5_000; i++) await server.inject(request)
  let best = Infinity
  for (let round = 0; round < 7; round++) {
    // inject() settles without a macrotask, so the loop below never lets the
    // event loop turn. Yield between rounds so that per-request resources
    // released on a later tick can be collected.
    await new Promise((resolve) => setImmediate(resolve))
    const start = performance.now()
    for (let i = 0; i < iterations; i++) await server.inject(request)
    best = Math.min(best, ((performance.now() - start) * 1000) / iterations)
  }
  return best
}

const raw = await buildRaw()
const navios = await buildNavios()

const get = { method: 'GET', url: '/ping' }
const post = { method: 'POST', url: '/users/42?q=a', payload: { name: 'n', age: 3 } }

console.log(`node ${process.version}, NODE_ENV=${process.env.NODE_ENV ?? ''}\n`)

const rawGet = await measure(raw, get)
const rawPost = await measure(raw, post)
console.log(`${'raw Fastify: GET, response schema'.padEnd(52)} ${rawGet.toFixed(2)} µs`)
console.log(
  `${'raw Fastify: POST, query + body + response schema'.padEnd(52)} ${rawPost.toFixed(2)} µs\n`,
)

const cases = [
  ['GET, response schema', get, rawGet, 1.0],
  ['POST, query + body + response schema', post, rawPost, 1.0],
  ['GET with one guard', { method: 'GET', url: '/guarded' }, rawGet, 1.5],
  ['GET reading one request value', { method: 'GET', url: '/value' }, rawGet, 1.3],
  ['GET using one request-scoped service', { method: 'GET', url: '/scoped' }, rawGet, 3.0],
]

let over = 0
for (const [name, request, baseline, budget] of cases) {
  const micros = await measure(navios, request)
  const overhead = micros - baseline
  const verdict = overhead <= budget ? 'ok' : `OVER BUDGET (+${budget})`
  if (overhead > budget) over++
  console.log(
    `${`Navios: ${name}`.padEnd(52)} ${micros.toFixed(2)} µs  overhead ${overhead >= 0 ? '+' : ''}${overhead.toFixed(2)} µs  ${verdict}`,
  )
}

await raw.close()
await navios.close()

if (process.argv.includes('--check') && over > 0) {
  console.error(`\n${over} case(s) over budget`)
  process.exit(1)
}
