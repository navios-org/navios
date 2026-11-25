import {
  AttributeFactory,
  createApplication,
  createContextKey,
  Injectable,
  Module,
} from '@navios/core'
import { messageBuilder } from '@navios/queues'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { Application, ExecutionContext, Guard } from '@navios/core'
import type { QueueClient } from '@navios/queues'

import {
  isMessageContext,
  Message,
  MessageController,
  MessageDeniedError,
  messageTransport,
  MessageValidationError,
} from '../index.mjs'

import type { MessageContext, MessageGuard, MessageParams } from '../index.mjs'

const messages = messageBuilder()

const userCreated = messages.declarePubSub({
  topic: 'user.created',
  payloadSchema: z.object({ id: z.string(), name: z.string().default('anonymous') }),
})

const sendEmail = messages.declarePointToPoint({
  queue: 'emails',
  payloadSchema: z.object({ to: z.string() }),
})

const getUser = messages.declareRequestReply({
  topic: 'user.get',
  payloadSchema: z.object({ id: z.string() }),
  responseSchema: z.object({ id: z.string(), name: z.string() }),
})

/** A queue client that keeps its subscriptions, so a test can deliver to them. */
function createClient() {
  const handlers = new Map<string, (message: unknown) => Promise<unknown>>()
  const client: QueueClient = {
    publish: async () => {},
    send: async () => {},
    request: async () => undefined,
    subscribe: async (topic, handler) => void handlers.set(`subscribe:${topic}`, handler),
    receive: async (queue, handler) => void handlers.set(`receive:${queue}`, handler),
    reply: async (topic, handler) => void handlers.set(`reply:${topic}`, handler),
    disconnect: async () => {},
  }
  return { client, handlers }
}

const apps: Application[] = []

async function createApp(module: new () => unknown, client?: QueueClient) {
  const app = createApplication(module, {
    logger: false,
    transports: [messageTransport({ client })],
  })
  apps.push(app)
  await app.init()
  return { app, transport: app.transport(messageTransport) }
}

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close()
  }
})

describe('messageTransport', () => {
  it('finds the handlers of the controllers that modules list', async () => {
    @MessageController()
    class UsersConsumer {
      @Message(userCreated)
      async onCreated() {}

      @Message(getUser)
      async get({ payload }: MessageParams<typeof getUser>) {
        return { id: payload.id, name: 'Ada' }
      }
    }
    @Module({ messageControllers: [UsersConsumer] })
    class UsersModule {}
    @Module({ imports: [UsersModule] })
    class AppModule {}

    const { transport } = await createApp(AppModule)

    expect(
      transport.handlers().map((handler) => [handler.pattern, handler.destination, handler.name]),
    ).toEqual([
      ['pubsub', 'user.created', 'UsersConsumer.onCreated'],
      ['request-reply', 'user.get', 'UsersConsumer.get'],
    ])
  })

  it('validates the payload and hands the parsed value to the handler', async () => {
    const received: unknown[] = []

    @MessageController()
    class UsersConsumer {
      @Message(userCreated)
      async onCreated({ payload }: MessageParams<typeof userCreated>) {
        received.push(payload)
      }
    }
    @Module({ messageControllers: [UsersConsumer] })
    class AppModule {}
    const { transport } = await createApp(AppModule)

    await transport.dispatch(userCreated, { id: '1' })
    await expect(transport.dispatch(userCreated, { id: 1 })).rejects.toBeInstanceOf(
      MessageValidationError,
    )

    expect(received).toEqual([{ id: '1', name: 'anonymous' }])
  })

  it('returns the reply of a request-reply handler', async () => {
    @MessageController()
    class UsersConsumer {
      @Message(getUser)
      async get({ payload }: MessageParams<typeof getUser>) {
        return { id: payload.id, name: 'Ada' }
      }
    }
    @Module({ messageControllers: [UsersConsumer] })
    class AppModule {}
    const { transport } = await createApp(AppModule)

    expect(await transport.dispatch(getUser, { id: '7' })).toEqual({ id: '7', name: 'Ada' })
  })

  it('runs module, controller and handler guards with a message context', async () => {
    const order: string[] = []
    const Tenant = createContextKey<string>('Tenant')
    const Internal = AttributeFactory.createAttribute(Symbol.for('test.microservice.Internal'))

    @Injectable()
    class ModuleGuard implements Guard {
      canActivate(ctx: ExecutionContext) {
        order.push(`module:${ctx.kind}`)
        if (isMessageContext(ctx)) {
          ctx.set(Tenant, (ctx.raw as { tenant: string }).tenant)
        }
        return true
      }
    }
    @Injectable()
    class ControllerGuard implements MessageGuard {
      canActivate(ctx: MessageContext) {
        order.push(`controller:${ctx.message.topic}:${AttributeFactory.has(Internal, ctx.handler)}`)
        return ctx.get(Tenant) !== 'blocked'
      }
    }

    @MessageController({ guards: [ControllerGuard] })
    class UsersConsumer {
      @Internal()
      @Message(userCreated)
      async onCreated() {
        order.push('handler')
      }
    }
    @Module({ messageControllers: [UsersConsumer], guards: [ModuleGuard] })
    class AppModule {}
    const { transport } = await createApp(AppModule)

    await transport.dispatch(userCreated, { id: '1' }, { tenant: 'acme' })
    await expect(
      transport.dispatch(userCreated, { id: '2' }, { tenant: 'blocked' }),
    ).rejects.toBeInstanceOf(MessageDeniedError)

    expect(order).toEqual([
      'module:message',
      'controller:user.created:true',
      'handler',
      'module:message',
      'controller:user.created:true',
    ])
  })

  it('wraps the handler in interceptors, outermost first', async () => {
    const order: string[] = []

    @Injectable()
    class Outer {
      async intercept(_ctx: ExecutionContext, next: () => Promise<unknown>) {
        order.push('outer:in')
        const result = await next()
        order.push('outer:out')
        return result
      }
    }
    @Injectable()
    class Inner {
      async intercept(_ctx: ExecutionContext, next: () => Promise<unknown>) {
        order.push('inner:in')
        return next()
      }
    }

    @MessageController({ interceptors: [Inner] })
    class UsersConsumer {
      @Message(userCreated)
      async onCreated() {
        order.push('handler')
      }
    }
    @Module({ messageControllers: [UsersConsumer] })
    class AppModule {}
    const app = createApplication(AppModule, {
      logger: false,
      transports: [messageTransport({})],
    })
    apps.push(app)
    app.intercept(Outer)
    await app.init()

    await app.transport(messageTransport).dispatch(userCreated, { id: '1' })

    expect(order).toEqual(['outer:in', 'inner:in', 'handler', 'outer:out'])
  })

  it('subscribes every handler with the client on start, by its pattern', async () => {
    const received: unknown[] = []

    @MessageController()
    class Consumer {
      @Message(userCreated)
      async onCreated({ payload }: MessageParams<typeof userCreated>) {
        received.push(payload)
      }

      @Message(sendEmail)
      async send({ payload }: MessageParams<typeof sendEmail>) {
        received.push(payload)
      }

      @Message(getUser)
      async get({ payload }: MessageParams<typeof getUser>) {
        return { id: payload.id, name: 'Ada' }
      }
    }
    @Module({ messageControllers: [Consumer] })
    class AppModule {}
    const { client, handlers } = createClient()
    const { app } = await createApp(AppModule, client)

    expect(handlers.size).toBe(0)
    await app.start()

    expect([...handlers.keys()].sort()).toEqual([
      'receive:emails',
      'reply:user.get',
      'subscribe:user.created',
    ])
    await handlers.get('subscribe:user.created')!({ id: '1', name: 'Ada' })
    await handlers.get('receive:emails')!({ to: 'ada@example.com' })
    expect(await handlers.get('reply:user.get')!({ id: '7' })).toEqual({ id: '7', name: 'Ada' })
    expect(received).toEqual([{ id: '1', name: 'Ada' }, { to: 'ada@example.com' }])
  })

  it('waits for messages in flight on close and refuses new ones afterwards', async () => {
    let finish!: () => void
    const done: string[] = []

    @MessageController()
    class Consumer {
      @Message(userCreated)
      async onCreated() {
        await new Promise<void>((resolve) => {
          finish = resolve
        })
        done.push('handled')
      }
    }
    @Module({ messageControllers: [Consumer] })
    class AppModule {}
    const { client, handlers } = createClient()
    const { app } = await createApp(AppModule, client)
    await app.start()
    const deliver = handlers.get('subscribe:user.created')!

    const inFlight = deliver({ id: '1' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const closing = app.close().then(() => done.push('closed'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(done).toEqual([])

    finish()
    await inFlight
    await closing

    expect(done).toEqual(['handled', 'closed'])
    await expect(deliver({ id: '2' })).rejects.toThrow('is stopped')
  })

  it('refuses two handlers for one destination', async () => {
    @MessageController()
    class First {
      @Message(sendEmail)
      async send() {}
    }
    @MessageController()
    class Second {
      @Message(sendEmail)
      async send() {}
    }
    @Module({ messageControllers: [First, Second] })
    class AppModule {}
    const app = createApplication(AppModule, {
      logger: false,
      transports: [messageTransport({})],
    })
    apps.push(app)

    await expect(app.init()).rejects.toThrow(
      '[Navios] point-to-point emails is handled by both First.send and Second.send.',
    )
  })

  it('says so when a listed class is not a message controller', async () => {
    class Plain {}
    @Module({ messageControllers: [Plain] })
    class AppModule {}
    const app = createApplication(AppModule, {
      logger: false,
      transports: [messageTransport({})],
    })
    apps.push(app)

    await expect(app.init()).rejects.toThrow(
      '[Navios] Plain is not a message controller. Make sure it is decorated with @MessageController.',
    )
  })

  it('fails to dispatch a message nothing handles', async () => {
    @Module({})
    class AppModule {}
    const { transport } = await createApp(AppModule)

    await expect(transport.dispatch(sendEmail, { to: 'x' })).rejects.toThrow(
      '[Navios] No handler for point-to-point emails.',
    )
  })
})
