# Errors

Every error response Navios produces is `application/problem+json` ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)), unless the endpoint declares a body for that status in `errorSchema`.

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "User not found"
}
```

## How a thrown error becomes a response

Anything thrown by an interceptor, a guard, validation or a handler goes through these steps in order. The first that applies produces the response.

1. An error mapper registered with `app.mapError` for the error's class or one of its parent classes.
2. `HttpException`: its status, with a declared or problem body.
3. A guard that returned `false`: the Forbidden responder (403).
4. A request validation error: the validation responder (400).
5. Anything else: logged in full, then the internal-error responder (500).

A response body that fails its schema is not a validation error in the sense of step 4. It is the server's fault and goes to step 5.

## `HttpException`

```ts
import { HttpException, NotFoundException } from '@navios/core'

throw new NotFoundException('User not found')
throw new HttpException(418, 'I am a teapot')
throw new HttpException(409, { reason: 'name is taken' })
```

`new HttpException(statusCode, response, cause?)` extends `Error`. `response` is a string or an object.

| Endpoint declares the status in `errorSchema` | Response                                         |
| --------------------------------------------- | ------------------------------------------------ |
| yes                                           | `response` is sent as the JSON body, as is.      |
| no, `response` is a string                    | problem+json with `detail` set to the string.    |
| no, `response` is an object                   | problem+json with the object's fields merged in. |

The body of a thrown `HttpException` is not type-checked against `errorSchema`. Outside production (`NODE_ENV` other than `production`) it is validated at run time: a mismatch is logged as an error, and the response is sent as thrown. A string response is never treated as a declared body; it is sent as a problem response. For a type-checked error body, return `reply(status, body)` from the handler instead; see [Controllers and handlers](./controllers.md#declared-error-bodies).

Subclasses, each with a default message:

| Class                          | Status |
| ------------------------------ | ------ |
| `BadRequestException`          | 400    |
| `UnauthorizedException`        | 401    |
| `ForbiddenException`           | 403    |
| `NotFoundException`            | 404    |
| `ConflictException`            | 409    |
| `UnprocessableEntityException` | 422    |
| `TooManyRequestsException`     | 429    |
| `InternalServerErrorException` | 500    |

## Mapping domain errors: `app.mapError`

Services should throw their own errors and not know about HTTP. A mapper turns an error class into a response:

```ts
class UserNotFound extends Error {}

app.mapError(UserNotFound, (error, ctx) => reply(404, { message: error.message }))
```

- The mapper receives the error and the `RequestContext`, and returns `reply(status, body)` or a full `RouteResult`. It may be asynchronous.
- The most specific registered class wins: with mappers for `DomainError` and for `UserNotFound extends DomainError`, a `UserNotFound` uses its own mapper.
- A mapper's `reply()` is sent as JSON as given. It is not checked against the endpoint's `errorSchema` and does not have to be declared. To send a problem response from a mapper, return `problem(status, detail)`.
- Mappers run before the built-in handling of `HttpException`, so a mapper registered for `HttpException` or a subclass replaces it.
- When a mapper itself throws, the error it threw goes through steps 2 to 5.
- Mappers are not consulted for requests that match no route.

`app.mapError` may be called before or after `init()`. A plugin registers mappers with `api.mapError`.

## Unexpected errors and `exposeErrorDetails`

An error that reaches step 5 is logged with the request's method and path, and the client receives:

```json
{
  "type": "about:blank",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "An unexpected error occurred"
}
```

The error's message is not sent, because it can contain connection strings, SQL or file paths. With `exposeErrorDetails: true` the message is sent as `detail`:

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  exposeErrorDetails: process.env.NODE_ENV !== 'production',
})
```

## Validation errors

A request that fails validation gets a 400 problem with two extra fields: `source`, the part of the request that failed (`urlParams`, `query`, `headers`, `cookies` or `body`), and `errors`, a list of `{ path, message }`. An example is in [Controllers and handlers](./controllers.md#request-validation).

In code, the error is a `ValidationError` with `source` and `issues` (Standard Schema issues). It can be mapped like any other class:

```ts
app.mapError(ValidationError, (error) =>
  problem(422, 'Validation failed', { fields: error.issues.map((issue) => issue.message) }),
)
```

Such a mapper also receives response validation errors, which have `source: 'response'`. Rethrow those so that they stay a 500.

## Responders

Four framework responses are produced by replaceable singletons:

| Token                               | Used for                        | Default                                |
| ----------------------------------- | ------------------------------- | -------------------------------------- |
| `NotFoundResponderToken`            | a request that matches no route | 404 problem                            |
| `ForbiddenResponderToken`           | a guard returned `false`        | 403 problem                            |
| `ValidationErrorResponderToken`     | request validation failed       | 400 problem with `source` and `errors` |
| `InternalServerErrorResponderToken` | an unexpected error             | 500 problem                            |

A responder implements `ErrorResponder`:

```ts
import { Injectable, NotFoundResponderToken, problem, provide } from '@navios/core'

import type { ErrorResponder, RouteResult } from '@navios/core'

@Injectable()
class JsonNotFound implements ErrorResponder {
  getResponse(_error: unknown, description?: string): RouteResult {
    return { status: 404, body: { error: 'not_found', description }, kind: 'json' }
  }
}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  providers: [provide(NotFoundResponderToken, JsonNotFound)],
})
```

`description` is a message from the framework: the unmatched method and path for not-found, and the error's message for the internal-error responder when `exposeErrorDetails` is on. Responders are resolved once at `init()`.

`problem(status, detail?, extra?)` builds a problem `RouteResult` and is the simplest way to write a responder or a mapper that keeps the problem format.
