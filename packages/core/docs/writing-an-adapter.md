# Writing an adapter

An adapter binds Navios to an HTTP server. It registers routes with the server, turns each native request into a `RouteInput`, calls the route's executor and writes the `RouteResult` it gets back. It contains no guard, validation or error-mapping logic; all of that is inside the executor and is the same on every adapter.

The two adapters in this repository are the working references: `packages/adapter-fastify/src/fastify-adapter.mts` and `packages/adapter-bun/src/bun-adapter.mts`. The in-memory adapter in `packages/core/src/testing/in-memory-adapter.mts` is the smallest implementation.

## The definition

An adapter package exports a function that returns an `AdapterDefinition`:

```ts
import type { AdapterDefinition, HttpAdapterEnvironment } from '@navios/core'

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

`create(context)` is called once during `init()` and may return a promise. `context` is an `AdapterContext`:

| Field          | Use                                                           |
| -------------- | ------------------------------------------------------------- |
| `container`    | The application's DI container.                               |
| `logger`       | A logger for the adapter's own messages.                      |
| `errors`       | The application's `ErrorPipeline`.                            |
| `globalPrefix` | The normalised global prefix. Route paths already include it. |

Server features such as CORS, body limits and multipart are options of the definition function, because the application has no methods for them.

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

| Member                 | Contract                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `register(route)`      | Called once per route, before `ready()`. `route.info` is the `RouteInfo`; `route.execute` is the executor. `route.info.path` uses the builder's form, `/users/$id`. |
| `setNotFound(execute)` | The executor for requests that match no route. Call it with a `RouteInput` like any other; it returns the not-found response.                                       |
| `ready()`              | Called once after all routes are registered.                                                                                                                        |
| `listen(options)`      | Starts the server and resolves to its base URL.                                                                                                                     |
| `inject(request)`      | Handles a `TestRequest` in process and resolves to a `TestResponse`. It should go through as much of the server's real request path as the server allows.           |
| `close(timeoutMs)`     | Stops accepting connections and waits for in-flight requests, for at most `timeoutMs`.                                                                              |

## `RouteInput`

For each request the adapter builds one `RouteInput` and passes it to the executor:

```ts
interface RouteInput {
  readonly method: string
  readonly path: string // without the query string
  readonly id?: string // the server's request id, if it has one
  header(name: string): string | undefined
  headers(): Headers
  readonly urlParams: Record<string, string>
  query(): unknown
  body(): unknown | Promise<unknown>
  signal(): AbortSignal
  readonly raw: unknown // becomes ctx.raw
}
```

Everything that may cost something is a function, so a route that does not need it never pays for it. Follow the same rule inside the adapter: do not parse the query, copy headers or create an `AbortController` until the function is called.

Requirements:

- `urlParams` holds the parameters of the whole path, prefixes included, as URL-decoded strings.
- `query()` returns the parsed query string as an object, with an array for a repeated parameter. Core calls it at most once per request. Core validates it with the endpoint's schema; coercion is the schema's job.
- `body()` is not called before guards have passed. It returns the parsed body, or a promise of it. Do not read the request body before it is called when the server lets you defer it.
- A malformed body must be reported by throwing `new ValidationError('body', [{ message }])` from `body()`, so that it becomes a 400 like any other validation failure.
- For an endpoint with `body: 'multipart'` (`route.info.endpoint.body`), build the body with `createMultipartCollector(route.info.endpoint.requestSchema)`: call `add(field, value)` for every part, with a string for a text field and a `File` for a file, and return `result()`.
- `signal()` returns a signal that aborts when the client disconnects before the response is complete. It must not abort because the request body has been read, and it must already be aborted when it is first read after the client has gone.
- Using a class with prototype methods for the input, as both shipped adapters do, allocates one object per request instead of one closure per accessor.

## `RouteResult`

The executor returns a `RouteResult`, or a promise of one. It does not throw for request errors: every error has already been mapped to a result. Check `result instanceof Promise` and avoid `await` on the synchronous path.

```ts
interface RouteResult {
  status: number
  headers?: Record<string, string>
  cookies?: SetCookie[]
  body: unknown
  kind: 'json' | 'text' | 'blob' | 'stream' | 'sse' | 'empty' | (string & {})
  release?: () => void | Promise<void>
}
```

How to write each kind:

| `kind`   | `body`                                                               | Default `content-type`      |
| -------- | -------------------------------------------------------------------- | --------------------------- |
| `json`   | Any JSON value. Serialise with `JSON.stringify`.                     | `application/json`          |
| `text`   | A string, a `ReadableStream` or an async iterable.                   | `text/plain; charset=utf-8` |
| `blob`   | A `Blob`, `ArrayBuffer`, typed array or `ReadableStream`.            | `application/octet-stream`  |
| `stream` | A `ReadableStream`, or an async iterable of strings or `Uint8Array`. | `application/octet-stream`  |
| `sse`    | An async iterable of already-framed strings.                         | `text/event-stream`         |
| `empty`  | Ignore `body`. Send no body.                                         | none                        |

- A `content-type` in `result.headers` wins over the default.
- Core itself writes lower-case header names into `result.headers`.
- Serialise each entry of `result.cookies` with `serializeCookie(cookie)` from `@navios/core` and send one `Set-Cookie` header per entry.
- When the client disconnects while a stream is being written, stop iterating and call the iterator's `return()`.

### `release`

`release` is present when the request holds resources (a DI scope, request values with a `dispose` hook, `onFinish` callbacks) and on every streamed body, which may acquire some while it is being sent. The adapter must call it exactly once, when the response has been fully sent or the connection has gone away, whichever comes first. For a body already in memory that is right after writing it; for a stream it is when the stream ends or is cancelled.

Most results have no `release`. Check for it before installing any listener.

A result whose body cannot be written (`JSON.stringify` throws, an invalid header value) is the adapter's to handle: call `context.errors.unexpected(error)` for the response to send instead, and still call `release`.

## Running the conformance suite

`runAdapterConformance` from `@navios/core/conformance` exercises an adapter over real HTTP. It covers JSON routes with URL parameters and a coerced query, 400 responses for invalid input and malformed JSON, declared statuses and bodiless statuses, response field stripping, error mapping, the not-found response, guards running before body validation, request values and their disposal, request and response headers and cookies, text and streamed responses, multipart, request scope disposal, resources acquired by a stream, client disconnect (with and without a request body), JSON `null`, bodies that cannot be serialised, prefix parameters, `inject()` and graceful close with keep-alive clients.

It takes the test runner's functions as an argument, so it runs under Vitest, `bun:test` or anything with the same five functions. It uses a small built-in Standard Schema implementation and depends on no schema library.

```ts
// e2e/conformance.spec.mts
import { runAdapterConformance } from '@navios/core/conformance'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { defineMyEnvironment } from '../src/index.mjs'

runAdapterConformance({
  runner: { describe, it, expect, beforeAll, afterAll },
  name: 'my-server',
  adapter: () => defineMyEnvironment(),
  listenOptions: { port: 0 },
})
```

| Option          | Meaning                                                                       |
| --------------- | ----------------------------------------------------------------------------- |
| `runner`        | `{ describe, it, expect, beforeAll, afterAll }` from the test runner.         |
| `name`          | Shown in the suite title.                                                     |
| `adapter`       | Creates the adapter definition under test. Multipart support must be enabled. |
| `listenOptions` | Passed to `app.listen()`. It must bind an ephemeral local port.               |

An adapter is expected to pass every test. The suite is the definition of "behaves the same on every adapter"; when an adapter needs a behaviour the suite does not cover, add the test to the suite, not to the adapter.
