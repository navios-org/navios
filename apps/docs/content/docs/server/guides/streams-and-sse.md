---
title: Streams and server-sent events
---

# Streams and server-sent events

A declaration's `response` kind tells the server what a handler may return instead of a JSON body. The handler is still an `@Endpoint` method, the code is the same on every adapter, and it never touches the native reply object.

| `response` | The handler returns                                        | Default `content-type`      |
| ---------- | ---------------------------------------------------------- | --------------------------- |
| `'text'`   | a string, a `ReadableStream` or an async iterable          | `text/plain; charset=utf-8` |
| `'blob'`   | a `Blob`, `ArrayBuffer`, `Uint8Array` or `ReadableStream`  | `application/octet-stream`  |
| `'stream'` | a `ReadableStream`, an async iterable, or `sseStream(...)` | `application/octet-stream`  |

These responses are not validated at run time; there is no schema to validate against. Set another content type, and any other header, with `ctx.reply.header()`. A `Blob` that has a `type` uses it as the content type.

How these endpoints are declared, and how a client consumes them, is covered by the Builder guide [Downloads and streams](/docs/builder/guides/downloads-and-streams). The examples below implement three such declarations:

```ts title="files.mts"
export const exportUsers = API.declareEndpoint({ method: 'GET', url: '/reports/users', response: 'text' })

export const downloadInvoice = API.declareEndpoint({
  method: 'GET',
  url: '/invoices/$invoiceId/pdf',
  response: 'blob',
})

export const tailLogs = API.declareEndpoint({
  method: 'GET',
  url: '/logs',
  querySchema: z.object({ service: z.string() }),
  response: 'stream',
})
```

## Text

```ts
@Endpoint(exportUsers)
exportUsers(_params: HandlerParams<typeof exportUsers>, ctx: RequestContext) {
  ctx.reply.header('content-type', 'text/csv; charset=utf-8')
  return 'id,name\n1,Ada\n'
}
```

## Binary downloads

```ts
@Endpoint(downloadInvoice)
async downloadInvoice({ urlParams }: HandlerParams<typeof downloadInvoice>, ctx: RequestContext) {
  const pdf = await this.invoices.render(urlParams.invoiceId) // Uint8Array | null
  if (!pdf) {
    throw new NotFoundException('Invoice not found')
  }
  ctx.reply.header('content-type', 'application/pdf')
  ctx.reply.header('content-disposition', `attachment; filename="${urlParams.invoiceId}.pdf"`)
  return pdf
}
```

Errors work as on any endpoint: the `NotFoundException` is answered as a 404 problem response, and an `errorSchema` on the declaration allows `reply(404, body)`. See [Errors](/docs/server/essentials/errors).

To send a file from disk without loading it, return a stream of it:

```ts
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'

@Endpoint(downloadBackup) // response: 'stream'
downloadBackup(_params: HandlerParams<typeof downloadBackup>, ctx: RequestContext) {
  ctx.reply.header('content-type', 'application/gzip')
  return Readable.toWeb(createReadStream('/var/backups/latest.tar.gz'))
}
```

## Streaming

The simplest streaming handler is an async generator method. Each value it yields is written as one chunk: a string or a `Uint8Array`.

```ts
@Endpoint(tailLogs)
async *tailLogs({ params }: HandlerParams<typeof tailLogs>, ctx: RequestContext) {
  ctx.reply.header('content-type', 'text/plain; charset=utf-8')
  for await (const line of this.logs.follow(params.service, ctx.signal)) {
    yield `${line}\n`
  }
}
```

- `this` inside the generator is the controller, so injected services are available.
- Headers must be set before the first `yield`. Once a chunk has been written the status and headers are on the wire.
- Iteration stops when the client disconnects. `ctx.signal` aborts at the same moment; pass it to whatever produces the data so that the source stops too.
- A handler may also return any `AsyncIterable` or a web `ReadableStream` it got from elsewhere, such as the body of an upstream `fetch`.

### Errors while streaming

An error thrown before the first chunk is an ordinary error response: the generator above can throw `NotFoundException` on its first line and the client gets a 404.

After the first chunk the status has been sent, so there is nothing left to change. The connection is closed without a clean end, which the client sees as a failed read. When the consumer must know why, make the failure part of your stream's format, for example a final line or event that says so.

## Server-sent events

A `response: 'stream'` endpoint that returns `sseStream(source)` answers with `text/event-stream`. `source` is an async iterable of events; core writes the framing and sets `cache-control: no-cache`.

On the client this pairs with the Builder [Server-Sent Events](/docs/builder/realtime/server-sent-events) module. Events defined there with `defineEvent` are what `sse()` takes on the server, so both sides share the event name and the payload schema:

```ts title="team-events.mts"
import { eventSourceBuilder } from '@navios/builder/eventsource'

import { API } from './api.mjs'
import { userSchema } from './users.mjs' // from the Quick start

export const teamEvents = API.declareEndpoint({
  method: 'GET',
  url: '/teams/$teamId/events',
  response: 'stream',
})

const events = eventSourceBuilder()

export const onUserUpdated = events.defineEvent({
  eventName: 'user.updated',
  payloadSchema: userSchema,
})
```

```ts title="team-events.controller.mts"
import { Controller, Endpoint, inject, sse, sseStream } from '@navios/server'

import type { HandlerParams, RequestContext } from '@navios/server'

import { onUserUpdated, teamEvents } from './team-events.mjs'
import { UserChanges } from './user-changes.service.mjs'

@Controller()
export class TeamEventsController {
  private readonly changes = inject(UserChanges)

  @Endpoint(teamEvents)
  events({ urlParams }: HandlerParams<typeof teamEvents>, ctx: RequestContext) {
    return sseStream(this.updates(urlParams.teamId, ctx.signal))
  }

  private async *updates(teamId: string, signal: AbortSignal) {
    yield { event: 'ready', data: { teamId }, retry: 5000 }

    for await (const user of this.changes.subscribe(teamId, signal)) {
      yield sse(onUserUpdated, user, { id: user.id })
    }
  }
}
```

The client receives:

```text
event: ready
retry: 5000
data: {"teamId":"7"}

id: 1
event: user.updated
data: {"id":"1","name":"Ada","email":"ada@example.com"}
```

There are two ways to produce an event:

| Form                                     | Notes                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `sse(event, payload, { id?, retry? })`   | For a declared event. The payload is typed from its `payloadSchema` and validated against it             |
| `{ event?, data, id?, retry? }`          | Written by hand. `data` is sent as JSON unless it is a string. Without `event` the browser receives the default `message` event |

`sse()` accepts anything with `config: { eventName, payloadSchema? }`, so it does not require `@navios/builder`. The payload schema must validate synchronously. A payload that fails it throws inside the generator, and the rules of [errors while streaming](#errors-while-streaming) apply: after the first event the stream simply ends.

Guards, interceptors and [per-request state](/docs/server/guides/request-state) work for streamed responses as for any other. Request values and request-scoped services stay usable while the stream is being sent, and are released when it ends or the client goes away.

:::tip
A reverse proxy that buffers responses delays events until its buffer fills. Core sends `x-accel-buffering: no` with every event stream, which nginx honours; other proxies need buffering turned off for the route.
:::
