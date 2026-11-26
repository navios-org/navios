import { createClassContext } from '@navios/di/legacy-compat'

import type { ClassType } from '@navios/di'

import { BasicExecutionContext } from '../execution/basic-execution-context.mjs'
import { handlerChain } from '../metadata/handler-chain.mjs'
import { describeHandlerClass } from '../metadata/handler-class.mjs'
import { executeChain, resolveChain } from '../metadata/run-chain.mjs'
import { moduleClasses } from '../modules/module-graph.mjs'
import { defineTransport } from '../transports/transport.mjs'

import type { HandlerChain } from '../metadata/handler-chain.mjs'
import type { HandlerExtras } from '../metadata/member-metadata.mjs'
import type { Transport, TransportHost } from '../transports/transport.mjs'

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
   * Runs what applies to a handler class, as a transport runs it for a handler
   * that does nothing: the application's interceptors, the guards, the
   * interceptors of the module and the class. Resolves to whether every guard
   * allowed it.
   */
  run(handler: ClassType): Promise<boolean>
}

let runs = 0

/**
 * What decorators attached to a class, of either kind, without a decorator of
 * the transport's own having asked for it.
 */
function attachedTo(target: ClassType): HandlerExtras {
  const symbol = (Symbol as { metadata?: symbol }).metadata
  const standard = symbol && (target as unknown as Record<symbol, object | undefined>)[symbol]
  const { metadata } = createClassContext(target)
  const [first, second] = [standard, metadata].map((from) =>
    // Read through an object of its own: reading adds what is missing.
    describeHandlerClass({ metadata: Object.create(from ?? null) }),
  )
  return {
    guards: [...first.guards, ...second.guards],
    interceptors: [...first.interceptors, ...second.interceptors],
    attributes: new Map([...first.attributes, ...second.attributes]),
  }
}

/**
 * A transport for tests: it records its lifecycle and can run the guards and
 * interceptors of a handler class with a context of its own kind.
 */
export const fakeTransport = defineTransport<FakeTransportOptions, FakeTransport>({
  name: 'fake',
  create(host: TransportHost, options) {
    const { kind, entry, log } = options
    const found = new Map<ClassType, HandlerChain>()
    log.push(`${kind}:create`)
    return {
      get handlers() {
        return [...found.keys()]
      },
      setup(graph) {
        log.push(`${kind}:setup`)
        if (options.failSetup) {
          throw new Error(`${kind} setup failed`)
        }
        for (const node of graph) {
          for (const handler of moduleClasses(node, entry)) {
            const chain = handlerChain({
              application: host.interceptors,
              node,
              controller: handler,
              owner: attachedTo(handler),
              handlerName: 'run',
              member: { guards: [], interceptors: [], attributes: new Map() },
            })
            found.set(handler, chain)
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
        const chain = found.get(handler)
        if (!chain) {
          throw new Error(`${handler.name} is not a handler of the ${kind} transport`)
        }
        const resolved = await resolveChain<BasicExecutionContext, boolean>(host.container, chain)
        const ctx = new BasicExecutionContext({
          kind,
          id: `${kind}-${++runs}`,
          host: host.contextHost,
          handler: chain.info,
        })
        return executeChain(
          host,
          ctx,
          resolved,
          () => true,
          () => false,
        )
      },
    }
  },
})
