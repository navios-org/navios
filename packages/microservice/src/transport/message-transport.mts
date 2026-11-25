import {
  defineTransport,
  handlerChain,
  resolveChain,
  runChain,
  runInContext,
} from '@navios/core/transport'
import { QueueClientToken } from '@navios/queues'

import type { ClassType, StandardSchemaV1 } from '@navios/core'
import type {
  HandlerInfo,
  ModuleNode,
  ResolvedChain,
  Transport,
  TransportHost,
} from '@navios/core/transport'
import type { BaseMessageConfig, QueueClient } from '@navios/queues'

import { MessageContext } from '../context/message-context.mjs'
import { getMessageControllerMetadata } from '../controllers/message-controller.mjs'
import { MessageDeniedError, MessageValidationError } from '../errors.mjs'
import { memberMessage, messageDestination } from '../handlers/message.mjs'
import { moduleMessageControllers } from '../module-options.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MessageTransportOptions {
  /**
   * The client to subscribe with. When omitted, `QueueClientToken` is
   * resolved from the container, with `clientName` if given.
   */
  client?: QueueClient
  /** The name of the queue client to resolve. @default 'default' */
  clientName?: string
}

/**
 * A message handler as the transport knows it.
 */
export interface MessageHandlerInfo {
  readonly pattern: BaseMessageConfig['pattern']
  /** The topic or the queue. */
  readonly destination: string
  /** `Controller.method`. */
  readonly name: string
  readonly message: BaseMessageConfig
  readonly handler: HandlerInfo
}

/**
 * The message side of an application.
 */
export interface MessageTransport extends Transport {
  /** Every handler. Available once the application is initialised. */
  handlers(): readonly MessageHandlerInfo[]
  /**
   * Handles a message in process, the way a delivery from the broker is
   * handled: the application's interceptors, guards, the other interceptors,
   * validation, the handler. Resolves to the handler's reply. For tests, and
   * for delivering from a source of your own.
   */
  dispatch(
    message: { config: BaseMessageConfig<any, any, any> },
    payload: unknown,
    raw?: unknown,
  ): Promise<unknown>
}

interface CompiledHandler {
  info: MessageHandlerInfo
  chain: ResolvedChain<MessageContext>
  invoke(params: { payload: unknown }, ctx: MessageContext): unknown
}

function key(config: BaseMessageConfig<any, any, any>): string {
  return `${config.pattern} ${messageDestination(config)}`
}

async function validate(
  schema: StandardSchemaV1 | undefined,
  value: unknown,
  source: 'payload' | 'reply',
): Promise<unknown> {
  if (!schema) {
    return value
  }
  const result = await schema['~standard'].validate(value)
  if (result.issues) {
    throw new MessageValidationError(source, result.issues)
  }
  return result.value
}

let deliveries = 0

function createMessageTransport(
  host: TransportHost,
  options: MessageTransportOptions,
): MessageTransport {
  const compiled = new Map<string, CompiledHandler>()
  const inFlight = new Set<Promise<unknown>>()
  let stopped = false

  const run = async (handler: CompiledHandler, payload: unknown, raw: unknown) => {
    const { message } = handler.info
    const ctx = new MessageContext({
      id: `msg-${++deliveries}`,
      handler: handler.info.handler,
      host: host.contextHost,
      message,
      payload,
      raw,
    })
    const invoke = async () => {
      ctx.payload = await validate(message.payloadSchema as StandardSchemaV1, payload, 'payload')
      const reply = await handler.invoke({ payload: ctx.payload }, ctx)
      return validate(message.responseSchema as StandardSchemaV1 | undefined, reply, 'reply')
    }
    const deny = (guard: ClassType): never => {
      throw new MessageDeniedError(guard.name)
    }
    // Finishing happens inside the context too, so that `currentContext()`
    // still answers in `onFinish` callbacks.
    const handle = async () => {
      try {
        return await runChain(ctx, handler.chain, invoke, deny)
      } finally {
        await ctx.finish()
      }
    }
    return host.asyncContext ? runInContext(ctx, handle) : handle()
  }

  /** Handles one delivery and keeps it in sight until it is done. */
  const deliver = (handler: CompiledHandler, payload: unknown, raw: unknown): Promise<unknown> => {
    const running = run(handler, payload, raw)
    inFlight.add(running)
    const forget = () => inFlight.delete(running)
    running.then(forget, forget)
    return running
  }

  return {
    handlers: () => [...compiled.values()].map((handler) => handler.info),

    dispatch(message, payload, raw) {
      if (stopped) {
        return Promise.reject(new Error('[Navios] The message transport is stopped.'))
      }
      const handler = compiled.get(key(message.config))
      if (!handler) {
        return Promise.reject(new Error(`[Navios] No handler for ${key(message.config)}.`))
      }
      return deliver(handler, payload, raw ?? payload)
    },

    async setup(graph: readonly ModuleNode[]) {
      // A controller that several modules list is handled once, as a member
      // of the first of them in the graph.
      const seen = new Set<ClassType>()
      for (const node of graph) {
        for (const controllerClass of moduleMessageControllers(node)) {
          if (seen.has(controllerClass)) {
            continue
          }
          seen.add(controllerClass)
          const metadata = getMessageControllerMetadata(controllerClass)
          const controller = (await host.container.get(controllerClass)) as Record<string, unknown>

          for (const [memberName, member] of metadata.members) {
            const message = memberMessage(member)
            if (message === null) {
              // Another transport's handler, or a member with nothing to handle here.
              continue
            }
            const method = controller[memberName]
            if (typeof method !== 'function') {
              throw new Error(`[Navios] ${controllerClass.name}.${memberName} is not a method`)
            }
            const name = `${controllerClass.name}.${memberName}`
            const existing = compiled.get(key(message))
            if (existing) {
              throw new Error(
                `[Navios] ${key(message)} is handled by both ${existing.info.name} and ${name}.`,
              )
            }
            const chain = handlerChain({
              application: host.interceptors,
              node,
              owner: metadata,
              member,
            })
            compiled.set(key(message), {
              info: {
                pattern: message.pattern,
                destination: messageDestination(message),
                name,
                message,
                handler: {
                  module: node.module,
                  controller: controllerClass,
                  handlerName: memberName,
                  guards: chain.guards,
                  interceptors: chain.interceptors,
                  attributes: {
                    handler: member.attributes,
                    controller: metadata.attributes,
                    module: node.attributes,
                  },
                },
              },
              chain: await resolveChain<MessageContext>(host.container, chain),
              invoke: method.bind(controller) as CompiledHandler['invoke'],
            })
          }
        }
      }
    },

    async start() {
      if (compiled.size === 0) {
        return
      }
      // What the broker delivers after the stop is left unanswered. A client
      // has no way to unsubscribe, and failing the delivery would have it
      // reject the message, which a broker may then drop; an unanswered one
      // is redelivered when the client disconnects.
      const unanswered = new Promise<never>(() => {})
      const consume = (handler: CompiledHandler, payload: unknown): Promise<unknown> =>
        stopped ? unanswered : deliver(handler, payload, payload)

      const client =
        options.client ??
        ((await host.container.get(QueueClientToken, {
          name: options.clientName ?? 'default',
        })) as QueueClient)
      for (const handler of compiled.values()) {
        const { pattern, destination } = handler.info
        if (pattern === 'pubsub') {
          await client.subscribe(destination, async (payload) => {
            await consume(handler, payload)
          })
        } else if (pattern === 'point-to-point') {
          await client.receive(destination, async (payload) => {
            await consume(handler, payload)
          })
        } else {
          await client.reply(destination, (payload) => consume(handler, payload))
        }
      }
    },

    async stop(timeoutMs: number) {
      stopped = true
      if (inFlight.size === 0) {
        return
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        Promise.allSettled(inFlight),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs)
        }),
      ])
      clearTimeout(timer)
    },
  }
}

/**
 * Handles the application's messages: the `@Message` methods of the
 * controllers that modules list under `messageControllers`.
 *
 * ```ts
 * const app = createApplication(AppModule, {
 *   transports: [messageTransport()],
 * })
 * await app.start()
 * ```
 *
 * On start it subscribes every handler with the queue client: `subscribe`
 * for pub/sub, `receive` for point-to-point, `reply` for request-reply. On
 * close it waits for the messages in flight. It cannot unsubscribe, so what
 * the broker still delivers after that is left unanswered and is redelivered
 * once the client disconnects. Disconnecting is up to whoever created the
 * client.
 */
export const messageTransport = defineTransport<MessageTransportOptions, MessageTransport>({
  name: 'message',
  create: createMessageTransport,
})
