---
title: Controllers and handlers
---

# Controllers and handlers

A controller is a class decorated with `@Controller()`. Each handler in it implements one endpoint declared with `@navios/builder`; how to write the declarations is covered in [Declaring endpoints](/docs/builder/essentials/endpoints).

Controllers are singletons. Navios creates each one once at start-up, so nothing is constructed per request, and per-request data comes from the [request context](/docs/server/essentials/request-context) passed to every handler.

## Handlers

A handler is a method decorated with `@Endpoint(declaration)`. This page adds two endpoints to the example:

```ts title="users.mts"
// API and userSchema come from the Quick start
export const listUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({ limit: z.coerce.number().max(100).default(20) }),
  responseSchema: z.array(userSchema),
})

export const deleteUser = API.declareEndpoint({
  method: 'DELETE',
  url: '/users/$userId',
  response: 'void',
})
```

```ts title="users.controller.mts"
import { Controller, Endpoint, inject, reply } from '@navios/server'

import type { HandlerParams, RequestContext } from '@navios/server'

// getUser and UsersService come from the Quick start
@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  @Endpoint(getUser)
  async getUser({ urlParams }: HandlerParams<typeof getUser>, ctx: RequestContext) {
    ctx.reply.header('cache-control', 'private, max-age=60')
    return this.users.findById(urlParams.userId) ?? reply(404, { message: 'User not found' })
  }

  @Endpoint(listUsers)
  listUsers({ params }: HandlerParams<typeof listUsers>) {
    return this.users.list(params.limit) // params.limit is a number
  }

  @Endpoint(deleteUser)
  async deleteUser({ urlParams }: HandlerParams<typeof deleteUser>) {
    this.users.remove(urlParams.userId)
  }
}
```

`list` and `remove` are two more methods on `UsersService`.

- The first parameter is annotated with `HandlerParams<typeof endpoint>`. TypeScript does not infer a method's parameter types from a decorator, so the annotation is needed.
- The second parameter, `ctx: RequestContext`, is optional. A handler that needs neither takes no parameters.
- No return annotation is needed. `@Endpoint` checks the method against the declaration.
- The method may be `async` or not.

`@Endpoint` is the only handler decorator. It serves every kind of declaration: JSON, `response: 'void'`, text, binary, streams and multipart bodies.

## What a handler receives

`HandlerParams<typeof endpoint>` has a key for each part the declaration has:

| Key         | Present when the declaration has | Content                                                             |
| ----------- | -------------------------------- | ------------------------------------------------------------------- |
| `urlParams` | `$name` placeholders in `url`    | Path parameters: strings, or the output of `urlParamsSchema`        |
| `params`    | `querySchema`                    | The validated query: the schema's output                            |
| `data`      | `requestSchema`                  | The validated body: the schema's output                             |

The values are schema **outputs**. `listUsers` above declares `limit` with `z.coerce.number().default(20)`, so the client may send `?limit=5` or nothing, and the handler always receives a number. The table in [Sharing with Navios Server](/docs/builder/guides/navios-server#what-each-side-sees) compares this with what the client passes.

A declaration with `body: 'multipart'` delivers its parts in `data` the same way; see [File uploads](/docs/server/guides/file-uploads).

## What a handler returns

| Declaration                             | Return                                                    | Status        |
| --------------------------------------- | --------------------------------------------------------- | ------------- |
| `responseSchema`                        | the body                                                  | 200           |
| `responses: { 201: schema, 204: null }` | `reply(201, body)` or `reply(204)`                        | the one given |
| `errorSchema: { 404: schema }`          | additionally `reply(404, body)`                           | the one given |
| `response: 'void'`                      | nothing                                                   | 204           |
| `response: 'text'`                      | a string, a `ReadableStream` or an async iterable         | 200           |
| `response: 'blob'`                      | a `Blob`, `ArrayBuffer`, `Uint8Array` or `ReadableStream` | 200           |
| `response: 'stream'`                    | a `ReadableStream`, an async iterable or `sseStream(...)` | 200           |

The last three rows are covered in [Streams and server-sent events](/docs/server/guides/streams-and-sse).

Response headers and cookies are set through [`ctx.reply`](/docs/server/essentials/request-context#reply-controls), as `getUser` does above. The status is never set there: it comes from the declaration.

### Declared statuses

`reply(status, body)` answers with a specific status. The status must be listed in the endpoint's `responses` or `errorSchema`, and the body must match the schema for it.

```ts
@Endpoint(createUser)
async createUser({ data }: HandlerParams<typeof createUser>) {
  return reply(201, this.users.create(data))
}
```

- An endpoint declared with `responses` must return `reply()`. A bare value is a compile error and, at run time, a 500.
- A status mapped to `null` in `responses` has no body: `reply(204)`.
- `reply()` with a status the endpoint does not declare is a compile error and, at run time, a 500 whose log message lists the declared statuses.

### Declared error bodies

`errorSchema` lists the error statuses an endpoint can answer with and the body of each. There are two ways to send one.

```ts
// Type-checked: the body must match the 404 schema
return reply(404, { message: 'User not found' })

// Not type-checked: the exception's payload is sent as the body
throw new HttpException(404, { message: 'User not found' })
```

Prefer `reply()` in a handler. Throwing is for code that cannot return a response, such as a service several calls deep. What happens to an exception whose status is not in `errorSchema` is described in [Errors](/docs/server/essentials/errors#httpexception).

## What `@Endpoint` checks

`@Endpoint` is a compile error when the method does not fit the declaration:

- a parameter type that is not the declared one,
- a returned value of the wrong shape,
- `reply()` with a status the endpoint does not declare, or with the wrong body for that status,
- a bare value from an endpoint declared with `responses`,
- a value that is not a stream from a `response: 'stream'` endpoint.

Literal types are widened in this check: a field declared as `'low' | 'high'` is checked as `string`. TypeScript does not pass an expected type into the body of a decorated method, so `return { priority: 'high' }` is inferred as `{ priority: string }`, and a check against the literal type would reject correct code.

To have literal values checked too, annotate the return type with `HandlerResult<typeof endpoint>`:

```ts
import type { HandlerResult } from '@navios/server'

// getTask declares `priority: z.enum(['low', 'high'])`
@Endpoint(getTask)
async getTask({ urlParams }: HandlerParams<typeof getTask>): HandlerResult<typeof getTask> {
  return { id: urlParams.taskId, priority: 'urgent' } // compile error
}
```

Without the annotation, a wrong literal is still caught at run time by response validation.

## Validation

Both directions are validated against the declaration, with whichever Standard Schema library wrote the schemas.

**Requests.** URL parameters (when the declaration has a `urlParamsSchema`), then the query, then the body. The body is read from the connection only after guards have passed and the earlier parts are valid. A failure answers 400 with a [validation error body](/docs/server/essentials/errors#validation-errors) and the handler does not run.

Headers and cookies are not validated: `declareEndpoint` has no schema option for them, so read them from [`ctx.headers` and `ctx.cookies`](/docs/server/essentials/request-context#request-data). Core does validate a `headersSchema` and a `cookiesSchema` when a declaration's `config` carries them, reporting failures with `source: 'headers'` or `'cookies'`, but the handler types do not include the results.

**Responses.** A JSON body is validated against the schema for its status before it is sent. This removes fields the schema does not declare, which keeps internal fields such as a password hash from leaking. A body that does not match its schema is a 500, and the error is logged. `text`, `blob` and `stream` responses are not validated.

Response validation can be limited to development or switched off with the [`validateResponses`](/docs/server/essentials/application#options) application option.

## Controller options

Guards, interceptors and attributes can be attached to a whole controller or to one handler.

```ts
@Controller({ guards: [ApiKeyGuard] })
export class AdminController {
  @UseGuards(AdminGuard)
  @Endpoint(deleteUser)
  async deleteUser({ urlParams }: HandlerParams<typeof deleteUser>) {
    // ...
  }
}
```

`@Controller` accepts `guards`, `interceptors` and `attributes`. On a handler, `@UseGuards`, `@UseInterceptors` and attribute decorators go next to `@Endpoint`, in any order. [Guards and interceptors](/docs/server/essentials/guards-and-interceptors) and [Attributes](/docs/server/guides/attributes) explain what they do.

A controller has no path of its own. Path prefixes belong to [modules](/docs/server/essentials/modules#prefixes).

## Handlers without decorators

`handler()` defines a handler as a class field instead of a decorated method. It produces the same route as `@Endpoint`, and one controller can mix both.

```ts
import { Controller, handler, inject, reply } from '@navios/server'

@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  getUser = handler(getUser, ({ urlParams }, ctx) => {
    return this.users.findById(urlParams.userId) ?? reply(404, { message: 'User not found' })
  })

  listUsers = handler(listUsers, ({ params }) => this.users.list(params.limit))

  deleteUser = handler(deleteUser, { guards: [AdminGuard] }, ({ urlParams }) => {
    this.users.remove(urlParams.userId)
  })
}
```

- Both arguments of the function are inferred from the declaration. Nothing is annotated.
- The return value is checked against the declaration including literal values, because TypeScript passes the expected type into the function.
- `this` inside an arrow function is the controller, so `inject()` fields work. A `function` or an `async function*` passed to `handler()` has no `this`; to stream from controller fields, return a generator from an arrow function: `handler(tailLogs, ({ params }) => this.follow(params.service))`.
- An options object between the endpoint and the function takes `guards`, `interceptors` and `attributes` for that handler.
- `@UseGuards`, `@UseInterceptors` and attribute decorators also work on a `handler()` field. Guards and interceptors from decorators run before those from the options, and when the same attribute is set both ways the value from the options wins.
- Navios finds these handlers on the controller instance, so the field must be assigned by the time the constructor finishes. A static property is not found.

Use `handler()` when you prefer inferred parameters to the `HandlerParams` annotation, or when the code is built without a decorator transform. For the second case, `registerController(Class, options?)` and `registerModule(Class, options?)` replace `@Controller` and `@Module` and take the same options, and [`registerInjectable`](/docs/di/essentials/services#registering-without-decorators) does the same for services:

```ts
import { handler, registerController, registerModule } from '@navios/server'

class StatusController {
  listUsers = handler(listUsers, () => [])
}
registerController(StatusController)

class StatusModule {}
registerModule(StatusModule, { controllers: [StatusController] })
```

## Route rules checked at start-up

Navios builds the route table during `init()` and rejects it when a rule is broken. The application does not start, and the error names the classes involved.

| Rule                                                                 | Example of the error                                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| One handler per method and path. Parameter names do not distinguish paths | `GET /users/$userId is served by both UsersController.getUser and OtherController.find` |
| `@UseGuards`, `@UseInterceptors` and attributes need a handler       | `AdminController.purge has guards, interceptors or attributes but is not a handler`     |
| A controller cannot inject a request-scoped service                  | `Scope mismatch: UnitOfWork is request-scoped … (UsersController -> UnitOfWork)`        |
| A module with controllers is mounted under one prefix                | `Module UsersModule is imported under two different prefixes`                           |

One rule is checked earlier, when the class is defined: a method serves one endpoint. A second `@Endpoint` with another declaration on the same method throws `getUser already serves GET /users/$userId; a method can serve one endpoint.`

After `init()`, `app.routes()` returns every route as a `RouteInfo`: `method`, `path`, `endpoint` (the declaration's `config`), `module`, `controller`, `handlerName` (the name of the method or of the `handler()` field), `guards`, `interceptors` and `attributes`. `ctx.route` is the same object for the route being handled.

```ts
for (const route of app.routes()) {
  console.log(route.method, route.path, `${route.controller.name}.${route.handlerName}`)
}
// GET /users/$userId UsersController.getUser
```
