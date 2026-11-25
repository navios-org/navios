---
title: Writing an adapter
---

# Writing an adapter

An adapter binds Navios to an HTTP server. It registers routes with the server, turns each native request into a `RouteInput`, calls the route's executor and writes the `RouteResponse` it gets back. It contains no guard, decoding, validation or error-mapping logic: all of that is inside the executor and is the same on every adapter.

The contract is in `@navios/server/adapter`. Only what applications use as well, such as `HttpException` and `problem()`, comes from `@navios/server`.

The shipped adapters are the working references. `@navios/adapter-fastify` and `@navios/adapter-bun` are each a handful of source files, and the in-memory adapter in `@navios/server/testing` is the smallest implementation.

## The definition

An adapter package exports a function that returns an `AdapterDefinition`. Its environment type says what the application sees.

```ts
import type { AdapterDefinition, HttpAdapterEnvironment } from '@navios/server/adapter'

export interface MyEnvironment extends HttpAdapterEnvironment {
  raw: { request: MyRequest } // what ctx.raw is
  server: MyServer // what app.getServer() returns
  listenOptions: { port?: number } // what app.listen() accepts
}

export function defineMyEnvironment(options: MyOptions = {}): AdapterDefinition<MyEnvironment> {
  return {
    name: 'my-server',
    create: (context) => new MyAdapter(options, context),
  }
}
```

An application opts in to these types with the `Register` declaration described in [Request context](/docs/server/essentials/request-context). Do not declare it inside the adapter package: a project may have more than one adapter installed.

`create(context)` is called once during `init()` and may return a promise. `context` is an `AdapterContext`:

| Field          | Use                                                           |
| -------------- | ------------------------------------------------------------- |
| `container`    | The application's DI container.                               |
| `logger`       | A logger for the adapter's own messages.                      |
| `errors`       | The application's `ErrorPipeline`, for errors of the server itself. |
| `globalPrefix` | The normalised global prefix. Route paths already include it. |

Server features such as CORS, body limits and multipart are options of the definition function, because the application has no methods for them.

A body over the adapter's limit must be answered with a 413 problem response: write `encodeResult(problem(413, detail))` when the server reports it before the executor runs, or throw `new HttpException(413, detail)` while the body is read. Do not let the server answer with a page of its own.

## The `HttpAdapter` contract

```ts
interface HttpAdapter<Env extends HttpAdapterEnvironment = HttpAdapterEnvironment> {
  readonly server: Env['server']
  register(route: CompiledRoute): void
  setNotFound(execute: RouteExecutor): void
  ready(): Promise<void>
  listen(options: Env['listenOptions']): Promise<string>
  inject(request: TestRequest): Promise<TestResponse>
  close(timeoutMs: number): Promise<void>
}
```

| Member                 | Contract                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `register(route)`      | Called once per route, before `ready()`. `route.info` is the `RouteInfo`; `route.path` is its path, taken apart for a router; `route.execute` is the executor. Routes arrive in no particular order: fixed text must win over a URL parameter at the first segment that differs, and a path with a trailing slash must match only a route whose path ends with one. |
| `setNotFound(execute)` | The executor for requests that match no route. Call it with a `RouteInput` like any other; it returns the not-found response, or a 405 when the path is served for other methods. |
| `ready()`              | Called once after all routes are registered.                                                                                                                             |
| `listen(options)`      | Starts the server and resolves to its base URL.                                                                                                                          |
| `inject(request)`      | Handles a `TestRequest` in process and resolves to a `TestResponse`. It should go through as much of the server's real request path as the server allows, and must choose the same route as HTTP would. It rejects when the response fails after it has begun. |
| `close(timeoutMs)`     | Stops accepting connections and waits for in-flight requests, streams included, for at most `timeoutMs`. Then it closes the connections that are left. It does not wait for a connection on which no request was sent. |

A request handler is then a few lines. Check `result instanceof Promise` and avoid `await` on the synchronous path:

```ts
register({ info, path, execute }: CompiledRoute): void {
  this.server.on(info.method, toNativePath(path), (request) => {
    const result = execute(new MyRouteInput(request))
    return result instanceof Promise
      ? result.then((value) => this.write(request, value))
      : this.write(request, result)
  })
}
```

### Paths

`route.path.segments` has one entry per segment: `{ literal: 'users' }`, decoded, or `{ param: 'userId' }`. The last segment of a path with a trailing slash is the literal `''`. The server has checked that there is nothing else, so this is all an adapter translates:

```ts
function toNativePath({ segments }: RoutePath): string {
  return segments
    .map((segment) => ('param' in segment ? `/:${segment.param}` : `/${escape(segment.literal)}`))
    .join('')
}
```

`escape` stands for whatever the router needs to take the text as it is: Fastify's writes a colon as `::`, and Bun's compares paths before they are decoded, so it gets them percent-encoded.

A router that matches `/users/` to `/users/:userId`, or `..` to a parameter, may do so. The executor answers such a request as one that matched no route.

A server without a router uses `RouteTable`, as the in-memory adapter does: `add(method, path, value)`, and `match(method, path)` for the closest route and its decoded `urlParams`. A function passed to its constructor replaces `decodeURIComponent`, for a server whose router compares segments as they were sent. It serves `HEAD` with the `GET` route, which the router of an adapter has to do as well.

## `RouteInput`

For each request the adapter builds one `RouteInput` and passes it to the executor:

```ts
interface RouteInput {
  readonly method: string // in upper case
  readonly path: string // for a request that matched no route
  readonly id?: string // the server's request id, if it has one
  url(): string
  remoteAddress(): string | undefined
  header(name: string): string | undefined
  headers(): Headers
  headerRecord?(): Record<string, string | undefined>
  readonly urlParams: Record<string, string>
  query(): unknown
  readonly body: BodySource
  signal(): AbortSignal
  readonly raw: unknown // becomes ctx.raw
  responded?(): boolean
  respondedStatus?(): number
}
```

Everything that may cost something is a function or a getter, so a route that does not need it never pays for it. Follow the same rule inside the adapter: do not parse the query, copy headers or create an `AbortController` until the function is called. Using a class with prototype methods for the input, as both shipped adapters do, allocates one object per request instead of one closure per accessor. It can be its own `BodySource`.

Requirements:

- `path` is `canonicalPath(target)` of the request target. It is read for a request that matched no route. `ctx.path` of one that did comes from the route and `urlParams`, so that it is what was matched whatever the target looked like.
- `url()` returns the absolute URL of the request, or the target when the request names no valid host. The server replaces its path by `ctx.path`.
- `remoteAddress()` returns the address of the client, as far as the server knows or is told to trust it.
- `header(name)` must not find a member of `Object.prototype`, such as `constructor`.
- `urlParams` holds the parameters of the whole path, prefixes included, as URL-decoded strings.
- `query()` returns the parsed query string as an object, with an array for a repeated parameter, and takes names such as `__proto__` and `constructor` as plain names. The pipeline calls it at most once per request. It stays text: the server gives it the form its schema describes.
- `signal()` returns a signal that aborts when the client disconnects before the response is complete. It must not abort because the request body has been read, and it must already be aborted when it is first read after the client has gone.
- `headerRecord()` is optional. Implement it when the native request has its headers as a record already: it is what a `headersSchema` validates, and without it the pipeline builds a record from `headers()`. Names are lower-case, a repeated header is joined with `, `, and the record is the caller's to change, so return a copy.
- `responded()` is optional. Implement it when `raw` exposes a native reply a handler can write to, and return `true` once the handler has done so. The pipeline then skips response validation and hands back a response the adapter must not write, with a `release` to call when the handler's own response has ended. Such a response has `takenOver` set when the handler is writing it, perhaps later. Without it, and with an error status, the handler failed after taking over: close the connection unless something has been written. The Fastify adapter returns `reply.sent`.
- `respondedStatus()` belongs to `responded()`: the status of the response the handler wrote, read when it has finished.

### `BodySource`

```ts
interface BodySource {
  readonly contentType: string | undefined // the header as it was sent
  readonly isEmpty: boolean
  bytes(): Uint8Array | Promise<Uint8Array>
  parts(): AsyncIterable<BodyPart> | Promise<Iterable<BodyPart>>
  parsed?(): { value: unknown } | undefined
}
```

The server decodes bodies; an adapter gives it the bytes. Which member is called, if any, is the server's choice: it reads a body after guards have passed, or when a guard asks for `ctx.rawBody()`, and calls `bytes()` or `parts()` once.

- `isEmpty` is `true` when there is no body, or one that is known to have no bytes.
- `bytes()` returns the body as it was sent. Return it without a promise when it is there already. When the server lets you defer it, do not read the body before.
- `parts()` gives the parts of a multipart body in order, as `{ name, value }`: a string for a text field, a `File` for a file. They come one by one, or all together where the server parses the whole body. `readParts(bytes, contentType)` does it for a body that is in memory.
- For a body over the limit, throw `new HttpException(413, detail)`, from `parts()` too, where all parts count together when they are kept in memory. For one that cannot be parsed, throw `malformedMultipart(error)` or `new ValidationError('body', [{ message }])`, which is a 400. Other errors are the server's, and are logged.
- `parsed()` is optional. Implement it when the application can have the native server parse bodies of some content type, and return what it made of this one. The server takes it as it is.

## `RouteResponse`

The executor returns a `RouteResponse`, or a promise of one. It does not throw, and its promise does not reject: every error, including a result that cannot be sent, has already become a response.

```ts
interface RouteResponse {
  readonly status: number // 200 to 599
  readonly headers: Readonly<Record<string, string | readonly string[]>>
  readonly body: string | Uint8Array | Blob | ManagedBody | null
  readonly release: (() => Promise<void>) | undefined
  readonly takenOver?: boolean // only where RouteInput has responded()
}
```

There is nothing left to decide. Write the status, every header and the body:

- `headers` has lower-case names and checked values. The content type is among them, and `set-cookie` with every cookie. A list is one header line per value. The object may be shared by many responses, so do not change it.
- `body` is `null` when there is none. A JSON body is a string.
- A `ManagedBody` is produced while it is being sent. It is an async iterator of strings and `Uint8Array`s.

### `ManagedBody`

Read it with `next()`, one chunk at a time and no faster than the client takes them.

- When `next()` rejects, the server has reported the error. End the response so that the client sees a failure: do not send the end of a chunked body, and do not answer with an error instead.
- Do not read it for a `HEAD`. Send the headers that `GET` would have, and call `release`.
- The server closes what produces it when you call `release`. Nothing else is needed to stop it.
- Do not hold back the headers of a body whose first chunk takes its time, if the server lets you send them. `isStarted` says that the first chunk is there. That of an event stream may not be for a long time. If the server sends headers only together with the first bytes, send `opening` first when it is not `null`: text that means nothing to the client. Not for `inject()`.
- `isEventStream(headers)` says whether a response is one, for a server that closes connections on which nothing is sent.

### `release`

`release` is present when the request holds something: a DI scope, request values with a `dispose` hook, `onFinish` callbacks, or a `ManagedBody`. The adapter must call it exactly once, as soon as one of these is true:

- the response has been sent
- the connection is gone, which may have happened before the executor returned
- the body will not be sent, because the request is a `HEAD`
- writing failed, whatever the reason

For a body in memory, right after writing it is early enough when the server does not tell when it has been sent.

It closes the body, runs the `onFinish` callbacks, disposes request values and then the scope. It never rejects, and runs none of that before it returns, so it may be called from an event of the connection. What a request still holds when `close()` resolves is released before the container is disposed, so an adapter does not have to wait for it.

Most responses have no `release`. Check for it before installing any listener.

### The adapter's own responses

`inject()` turns a `TestRequest` into what is sent over HTTP with `toTestMessage(request)`, and answers with `toTestResponse(status, headers, text)`, so that a test sees the same on every adapter.

An error of the server itself, which never reached an executor or came after it, is answered with `context.errors.unexpected(error, { method, path })`. It reports the error and returns the `RouteResponse` to write. For a response that is not an error of the application, such as a 413, encode a result: `encodeResult(problem(413, detail))`.

When the error came after the headers of another response were set, remove those that `describesSuccess(name, value)` names first.

## Running the conformance suite

`runAdapterConformance` from `@navios/server/conformance` exercises an adapter over real HTTP. It covers:

- JSON routes with URL parameters and a query, prefix parameters, JSON `null`
- route precedence (static before parameter), no match for a trailing slash, an empty URL parameter or a dot segment, over HTTP and with `inject()`, and the paths that cannot be declared
- `HEAD` and 405 with `Allow`
- `ctx.path`, `ctx.url` and `ctx.ip`, with a `Host` and a request target in any form
- content types, JSON, text in the form its schema describes, raw bytes, and names of members of every object
- 400 responses for invalid input and malformed JSON, error mapping, the not-found response, bodies that cannot be serialised
- declared statuses, bodiless statuses and response field stripping
- guards running before body validation
- request values and their disposal, request scope disposal, resources acquired by a stream
- request and response headers and cookies: several values, names in any case, values that cannot be sent, and what an error response keeps of them
- text and streamed responses, responses without a body, and bodies that cannot be sent
- multipart, file names that are paths, and a request body that is needed twice
- client disconnect, with and without a request body
- streams: read one chunk at a time, and no faster than the client reads; a chunk is sent when it is produced; the headers of an event stream before its first event; closed when the client leaves, also before the first chunk, for a `HEAD` and when they cannot be sent; errors before and after the first chunk; the request scope until a stream is closed
- `inject()`, also of a response that fails after it has begun
- closing: connections without a request, requests and streams in flight, what outlives the timeout, and calls to a closed application
- with `cors` set, preflight requests, and the CORS headers and `Vary` of every other response, errors included
- with `bodyLimit` set, a 413 problem response for a JSON, text or multipart body over the limit

It takes the test runner's functions as an argument, so it runs under Vitest, `bun:test` or anything with the same five functions. It uses a small built-in Standard Schema implementation and depends on no schema library.

```ts title="e2e/conformance.spec.mts"
import { runAdapterConformance } from '@navios/server/conformance'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { defineMyEnvironment } from '../src/index.mjs'

runAdapterConformance({
  runner: { describe, it, expect, beforeAll, afterAll },
  name: 'my-server',
  adapter: () => defineMyEnvironment(),
  cors: (cors) => defineMyEnvironment({ cors }),
  listenOptions: { port: 0 },
})
```

| Option          | Meaning                                                                       |
| --------------- | ----------------------------------------------------------------------------- |
| `runner`        | `{ describe, it, expect, beforeAll, afterAll }` from the test runner.         |
| `name`          | Shown in the suite title.                                                     |
| `adapter`       | Creates the adapter definition under test. Multipart support must be enabled. |
| `cors`          | Optional. Creates the adapter definition under test with CORS for `{ origin, methods, credentials }`: a list of origins, a list of methods and `true`. Enables the CORS cases. Leave it out for an adapter without CORS. |
| `listenOptions` | Passed to `app.listen()`. It must bind an ephemeral local port. Leave it out for an adapter without a server: requests then go through `inject()`, and what needs a connection is not checked. |
| `bodyLimit`     | Optional. The largest request body in bytes the adapter under test accepts, 16 KiB or more: a JSON or text body, and one file of a multipart body. Enables the 413 cases, which run with and without a declared length and through `inject()`. |

An adapter is expected to pass every test. The suite is the definition of "behaves the same on every adapter".
