import {
  AttributeFactory,
  createApplication,
  createContextKey,
  currentContext,
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

    expect(transport.handlers().map((handler) => [handler.message, handler.name])).toEqual([
      [userCreated.config, 'UsersConsumer.onCreated'],
      [getUser.config, 'UsersConsumer.get'],
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

  it('takes only true from a guard for consent', async () => {
    let result: unknown
    let handled = 0

    @Injectable()
    class Loose implements MessageGuard {
      canActivate() {
        return result as boolean
      }
    }
    @MessageController({ guards: [Loose] })
    class Consumer {
      @Message(userCreated)
      async onCreated() {
        handled++
      }
    }
    @Module({ messageControllers: [Consumer] })
    class AppModule {}
    const { transport } = await createApp(AppModule)

    for (result of ['yes', Promise.resolve('yes'), 1, {}, undefined]) {
      await expect(transport.dispatch(userCreated, { id: '1' })).rejects.toBeInstanceOf(
        MessageDeniedError,
      )
    }
    expect(handled).toBe(0)
    for (result of [true, Promise.resolve(true)]) {
      await transport.dispatch(userCreated, { id: '1' })
    }
    expect(handled).toBe(2)
  })

  it('refuses a handler that inherits what its importers disagree about', async () => {
    const Open = AttributeFactory.createAttribute(Symbol.for('test.message.Open'))

    @MessageController()
    class Consumer {
      @Message(userCreated)
      async onCreated() {}
    }
    @MessageController()
    class Decided {
      @Open()
      @Message(userCreated)
      async onCreated() {}
    }
    const init = (controller: new () => unknown) => {
      @Module({ messageControllers: [controller] })
      class Shared {}
      @Module({ imports: [Shared], attributes: [Open()] })
      class Landing {}
      @Module({ imports: [Shared, Landing] })
      class AppModule {}
      return createApp(AppModule)
    }

    await expect(init(Consumer)).rejects.toThrow(
      '[Navios] Module Shared inherits different values of the attribute Symbol(test.message.Open): ' +
        'one over AppModule -> Landing -> Shared, none over AppModule -> Shared. Set it on the ' +
        'controllers or handlers it is meant for, or on Shared itself.',
    )
    const { transport } = await init(Decided)
    expect(transport.handlers()).toHaveLength(1)
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

  it('runs the guards inside the interceptors of the application and before all others', async () => {
    const log: string[] = []
    let allowed = true
    const around = (name: string) => {
      @Injectable()
      class Around {
        async intercept(_ctx: ExecutionContext, next: () => Promise<unknown>) {
          log.push(`${name}:enter`)
          try {
            return await next()
          } catch (error) {
            log.push(`${name}:${(error as Error).name}`)
            throw error
          }
        }
      }
      return Around
    }

    @Injectable()
    class Check implements Guard {
      canActivate() {
        log.push('guard')
        return allowed
      }
    }
    @MessageController({ guards: [Check], interceptors: [around('controller')] })
    class UsersConsumer {
      @Message(userCreated)
      async onCreated() {
        log.push('handler')
      }
    }
    @Module({ messageControllers: [UsersConsumer], interceptors: [around('module')] })
    class AppModule {}
    const app = createApplication(AppModule, { logger: false, transports: [messageTransport()] })
    apps.push(app)
    app.intercept(around('application'))
    await app.init()
    const transport = app.transport(messageTransport)

    await transport.dispatch(userCreated, { id: 'u1' })
    expect(log).toEqual([
      'application:enter',
      'guard',
      'module:enter',
      'controller:enter',
      'handler',
    ])

    log.length = 0
    allowed = false
    await expect(transport.dispatch(userCreated, { id: 'u1' })).rejects.toThrow(
      'Guard Check denied the message',
    )
    expect(log).toEqual(['application:enter', 'guard', 'application:MessageDeniedError'])
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

  it('waits for messages in flight on close, then leaves later deliveries unanswered', async () => {
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

    // A delivery after the stop is neither handled nor failed: failing it
    // would make a client reject the message, and a broker drop it. Left
    // unanswered, it is redelivered once the client disconnects.
    let settled = false
    const late = () => {
      settled = true
    }
    void deliver({ id: '2' }).then(late, late)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(settled).toBe(false)
    expect(done).toEqual(['handled', 'closed'])
    await expect(
      app.transport(messageTransport).dispatch(userCreated, { id: '3' }),
    ).rejects.toThrow('[Navios] The message transport is stopped.')
  })

  it.each([Infinity, 2 ** 31])(
    'waits for them however long with a shutdownTimeout of %d',
    async (shutdownTimeout) => {
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
      const app = createApplication(AppModule, {
        logger: false,
        shutdownTimeout,
        transports: [messageTransport()],
      })
      apps.push(app)
      await app.init()

      void app.transport(messageTransport).dispatch(userCreated, { id: '1' })
      await new Promise((resolve) => setTimeout(resolve, 0))
      const closing = app.close().then(() => done.push('closed'))
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(done).toEqual([])
      finish()
      await closing

      expect(done).toEqual(['handled', 'closed'])
    },
  )

  it('finishes the context when a guard throws', async () => {
    const finished: string[] = []

    @Injectable()
    class Failing implements Guard {
      canActivate(ctx: ExecutionContext): boolean {
        ctx.onFinish(() => void finished.push(ctx.id))
        throw new Error('directory unreachable')
      }
    }
    @MessageController({ guards: [Failing] })
    class Consumer {
      @Message(userCreated)
      async onCreated() {}
    }
    @Module({ messageControllers: [Consumer] })
    class AppModule {}
    const { transport } = await createApp(AppModule)

    await expect(transport.dispatch(userCreated, { id: '1' })).rejects.toThrow(
      'directory unreachable',
    )

    expect(finished).toHaveLength(1)
  })

  it('makes the message context the current one, also while it finishes', async () => {
    const seen: Array<string | undefined> = []

    @MessageController()
    class Consumer {
      @Message(userCreated)
      async onCreated() {
        await Promise.resolve()
        const ctx = currentContext()
        seen.push(ctx?.kind)
        ctx?.onFinish(() => void seen.push(currentContext()?.kind))
      }
    }
    @Module({ messageControllers: [Consumer] })
    class AppModule {}
    const app = createApplication(AppModule, {
      logger: false,
      asyncContext: true,
      transports: [messageTransport({})],
    })
    apps.push(app)
    await app.init()

    await app.transport(messageTransport).dispatch(userCreated, { id: '1' })

    expect(seen).toEqual(['message', 'message'])
  })

  it('starts without a queue client when there is nothing to subscribe', async () => {
    @Module({})
    class AppModule {}
    const { app } = await createApp(AppModule)

    await expect(app.start()).resolves.toBe(app)
  })

  it('handles a controller that two modules list once', async () => {
    @MessageController()
    class Consumer {
      @Message(userCreated)
      async onCreated() {}
    }
    @Module({ messageControllers: [Consumer] })
    class First {}
    @Module({ messageControllers: [Consumer], imports: [First] })
    class AppModule {}

    const { transport } = await createApp(AppModule)

    expect(transport.handlers().map((handler) => handler.name)).toEqual(['Consumer.onCreated'])
    expect(transport.handlers()[0].handler.module).toBe(First)
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

  it('names the module that lists something other than a class', async () => {
    @Module({ messageControllers: [undefined as never] })
    class CyclicModule {}
    const app = createApplication(CyclicModule, {
      logger: false,
      transports: [messageTransport({})],
    })
    apps.push(app)

    await expect(app.init()).rejects.toThrow(
      '[Navios] Module CyclicModule lists undefined in messageControllers.',
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
