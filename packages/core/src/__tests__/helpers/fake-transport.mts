import type { ClassType } from '@navios/di'

import { BasicExecutionContext } from '../../execution/basic-execution-context.mjs'
import { handlerChain } from '../../metadata/handler-chain.mjs'
import { defineTransport } from '../../transports/transport.mjs'

import type { Guard } from '../../guards/guard.mjs'
import type { Interceptor } from '../../interceptors/interceptor.mjs'
import type { ModuleNode } from '../../modules/module-graph.mjs'
import type { Transport, TransportHost } from '../../transports/transport.mjs'

export interface FakeTransportOptions {
  /** The `kind` of the contexts this transport creates. */
  kind: string
  /** The `@Module` option this transport reads its handler classes from. */
  entry: string
  /** Receives `<kind>:create`, `:setup`, `:start` and `:stop`. */
  log: string[]
  failSetup?: boolean
  failStart?: boolean
  failStop?: boolean
}

export interface FakeTransport extends Transport {
  /** The handler classes found in the graph, in graph order. */
  readonly handlers: ClassType[]
  /**
   * Runs what applies to a handler class: the interceptors, then the guards.
   * Resolves to whether every guard allowed it.
   */
  run(handler: ClassType): Promise<boolean>
}

let runs = 0

/**
 * A transport for tests: it records its lifecycle and can run the guards and
 * interceptors of a handler class with a context of its own kind.
 */
export const fakeTransport = defineTransport<FakeTransportOptions, FakeTransport>({
  name: 'fake',
  create(host: TransportHost, options) {
    const { kind, entry, log } = options
    const owners = new Map<ClassType, ModuleNode>()
    log.push(`${kind}:create`)
    return {
      get handlers() {
        return [...owners.keys()]
      },
      setup(graph) {
        log.push(`${kind}:setup`)
        if (options.failSetup) {
          throw new Error(`${kind} setup failed`)
        }
        for (const node of graph) {
          for (const handler of (node.entries.get(entry) as ClassType[] | undefined) ?? []) {
            owners.set(handler, node)
          }
        }
      },
      start() {
        log.push(`${kind}:start`)
        if (options.failStart) {
          throw new Error(`${kind} start failed`)
        }
      },
      async stop() {
        log.push(`${kind}:stop`)
        if (options.failStop) {
          throw new Error(`${kind} stop failed`)
        }
      },
      async run(handler) {
        const node = owners.get(handler)
        if (!node) {
          throw new Error(`${handler.name} is not a handler of the ${kind} transport`)
        }
        const none = { guards: [], interceptors: [] }
        const chain = handlerChain({
          application: host.interceptors,
          node,
          owner: none,
          member: none,
        })
        const ctx = new BasicExecutionContext({
          kind,
          id: `${kind}-${++runs}`,
          host: host.contextHost,
          handler: {
            module: node.module,
            controller: handler,
            handlerName: 'run',
            guards: chain.guards,
            interceptors: chain.interceptors,
            attributes: { handler: new Map(), controller: new Map(), module: node.attributes },
          },
        })
        let next = async (): Promise<unknown> => {
          for (const guardClass of chain.guards) {
            const guard = (await host.container.get(guardClass)) as Guard
            if (!(await guard.canActivate(ctx))) {
              return false
            }
          }
          return true
        }
        for (const interceptorClass of [...chain.interceptors].reverse()) {
          const interceptor = (await host.container.get(interceptorClass)) as Interceptor
          const inner = next
          next = async () => interceptor.intercept(ctx, inner)
        }
        try {
          return (await next()) as boolean
        } finally {
          await ctx.finish()
        }
      },
    }
  },
})
