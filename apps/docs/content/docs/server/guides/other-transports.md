---
title: Other transports
---

# Other transports

An application is a module tree, one DI container and the *transports* through which work reaches it. HTTP is one transport. A queue consumer is another, and an application can have several, or none.

`NaviosFactory.create` builds an application whose transport is HTTP. Underneath it is `createApplication` from `@navios/core`, which takes any list of transports:

```ts
import { createApplication } from '@navios/core'
import { messageTransport } from '@navios/microservice'

const app = createApplication(AppModule, {
  transports: [messageTransport()],
})
app.enableShutdownHooks()

await app.start()
```

Every transport shares the application's modules, providers, plugins and lifecycle hooks. `app.start()` initialises the application and starts each transport; `app.close()` stops them all, waits for work in flight, runs the shutdown hooks and disposes the container.

## A worker without HTTP

A process that only runs [scheduled jobs](/docs/server/guides/scheduled-jobs) depends on `@navios/core` and `@navios/schedule`, and on no adapter:

```ts
import { createApplication, Module } from '@navios/core'
import { scheduleTransport } from '@navios/schedule'

@Module({ jobs: [MaintenanceJobs] })
class WorkerModule {}

const app = createApplication(WorkerModule, {
  transports: [scheduleTransport()],
})
app.enableShutdownHooks()

await app.start()
```

## HTTP and something else

`NaviosFactory.create` accepts more transports beside HTTP. `app.listen()` binds the server and starts the others; `app.inject()` starts none, so a test that injects requests does not subscribe to a broker.

```ts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { messageTransport } from '@navios/microservice'
import { NaviosFactory } from '@navios/server'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  transports: [messageTransport()],
})

await app.listen({ port: 3000 })
```

`app.transport(messageTransport)` returns a transport of the application once it is initialised. A transport that is listed twice has a name each time, its second argument: `messageTransport(options, 'orders')`, which `app.transport(messageTransport, 'orders')` returns. An application has one HTTP transport and one schedule transport: to serve a public and an internal port over HTTP, create two applications, which may import the same modules.

## One module, several transports

Each transport package adds its own option to `@Module`. A module lists what it has for each, and an application that lacks one of those transports ignores that option:

```ts
@Module({
  imports: [DatabaseModule],
  controllers: [UsersController], // @navios/server
  messageControllers: [UsersConsumer], // @navios/microservice
})
export class UsersModule {}
```

`providers`, `imports`, `guards`, `interceptors` and `attributes` apply to every transport.

## Guards and interceptors on several transports

A guard or interceptor attached to a controller or to an HTTP handler only ever sees a `RequestContext`. One attached to a **module**, or to the whole application with `app.intercept` on an application made with `createApplication`, runs for every transport that has handlers there, and receives that transport's context.

Such a guard is written against `ExecutionContext`, which every context implements: `kind`, `id`, `signal`, `handler`, the context keys (`get`, `find`, `set`, `has`), `use`, `resolve` and `onFinish`. When it needs the request, it narrows:

```ts
import { Injectable, isHttpContext } from '@navios/server'

import type { ExecutionContext, Guard } from '@navios/core'

@Injectable()
export class ApiKeyGuard implements Guard {
  canActivate(ctx: ExecutionContext) {
    if (isHttpContext(ctx)) {
      return ctx.headers.get('x-api-key') === process.env.API_KEY
    }
    return true // messages are authenticated by the broker
  }
}
```

`Guard` and `Interceptor` imported from `@navios/core` are typed for any transport; the ones from `@navios/server` are typed for HTTP, as before. Nothing can check at boot that a module-level guard typed for HTTP is not also reached by another transport, so give a module that serves several transports guards of the first kind.

`AttributeFactory.get(Roles, ctx.handler)` reads an [attribute](/docs/server/guides/attributes) on any transport; on HTTP, `ctx.handler` is `ctx.route`.

## Messages

`@navios/microservice` handles messages declared with `messageBuilder()` from `@navios/queues`:

```ts
import { Module } from '@navios/core'
import { Message, MessageController } from '@navios/microservice'
import { messageBuilder } from '@navios/queues'
import { z } from 'zod/v4'

import type { MessageParams } from '@navios/microservice'

const messages = messageBuilder()

export const userCreated = messages.declarePubSub({
  topic: 'user.created',
  payloadSchema: z.object({ id: z.string(), email: z.email() }),
})

@MessageController()
class UsersConsumer {
  @Message(userCreated)
  async onCreated({ payload }: MessageParams<typeof userCreated>) {
    // payload is validated: { id: string; email: string }
  }
}

@Module({ messageControllers: [UsersConsumer] })
export class UsersModule {}
```

On start the transport subscribes each handler with the queue client: `subscribe` for pub/sub, `receive` for point-to-point and `reply` for request-reply. A delivery runs the interceptors of the application, the guards, the other interceptors, validates the payload and calls the handler; the return value of a request-reply handler is validated and sent back. `transport.dispatch(userCreated, payload)` does the same in process, which is how a test delivers a message.

## Writing a transport

A transport is defined with `defineTransport` from `@navios/core/transport`:

```ts
import { defineTransport } from '@navios/core/transport'

export const myTransport = defineTransport({
  name: 'my-transport',
  create(host, options: MyOptions) {
    return {
      setup(graph) {
        // read each module's own option from node.entries and prepare handlers
      },
      start() {
        // begin accepting work
      },
      stop(timeoutMs) {
        // stop accepting work and wait for what is in flight
      },
    }
  },
})
```

`setup` receives the module graph: every module in dependency order with its providers, the guards, interceptors and attributes it inherits, and `entries`, the `@Module` options the module system itself does not use. The same entry point exports what the rest needs, and the types only a transport uses, such as `TransportHost`; those it shares with application code, such as `Transport`, `HandlerInfo` and `Guard`, come from `@navios/core`:

- `moduleClasses(node, entry)` for the classes a module lists under your option, once each.
- `describeHandlerClass` for the decorator of your handler classes, and `memberMetadata` for decorators of their methods.
- `handlerChain` for the guards and interceptors that apply to a handler and the `HandlerInfo` its contexts carry, `resolveChain` for their instances, once, in `setup`, and `runChain` to run them around a handler. They are the same on every transport: the application's interceptors, then the guards, then the interceptors of the module, the class and the handler. `handlerChain` refuses a handler that would inherit an attribute its module's importers [disagree about](/docs/server/essentials/modules#module-guards-and-interceptors). A guard refuses with anything but `true`; `runChain` takes a function that says what becomes of the execution then.
- `BasicExecutionContext` for a context of your own kind, and `executeChain`, which runs the chain with it: in the async context when `host.asyncContext` is set, and with `finish()` afterwards, whatever the outcome.
- `settledWithin(work, ms)`, to wait for what is in flight in `stop(timeoutMs)`.

```ts
import {
  BasicExecutionContext,
  executeChain,
  handlerChain,
  resolveChain,
} from '@navios/core/transport'

// in setup(), for a method `name` of `HandlerClass`, described by `owner`
const chain = handlerChain({
  application: host.interceptors,
  node,
  controller: HandlerClass,
  owner,
  handlerName: name,
  member: owner.members.get(name)!,
})
const resolved = await resolveChain(host.container, chain)

// for each execution
const ctx = new BasicExecutionContext({
  kind: 'my-transport',
  id,
  handler: chain.info,
  host: host.contextHost,
})
await executeChain(
  host,
  ctx,
  resolved,
  () => handler(payload, ctx),
  (guard) => {
    throw new Error(`${guard.name} denied it`)
  },
)
```

`stop` is called once, and also when the application failed to initialise or to start, possibly before `setup` or `start` ran. It is called again, with no time to wait, when `start` settles only after it. A transport that takes much longer than `timeoutMs` is left behind. `@navios/core/testing` has `createContextHost` and `enableAsyncContext` for tests of a context of your own.
