---
title: Errors
---

# Errors

Every error response Navios produces is `application/problem+json` ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)), unless the endpoint declares its own body for that status in `errorSchema`.

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "User not found"
}
```

This page describes how an error becomes that response and how to change the outcome.

## How a thrown error becomes a response

Anything thrown by an interceptor, a guard, validation or a handler goes through these steps in order. The first that applies produces the response.

1. An error mapper registered with [`app.mapError`](#mapping-domain-errors) for the error's class or one of its parent classes.
2. An [`HttpException`](#httpexception): its status, with a declared or problem body.
3. A guard that returned `false`: the Forbidden responder (403).
4. A request validation error: the validation responder (400).
5. Anything else: logged in full, then the internal-error responder (500).

A response body that fails its schema is not a validation error in the sense of step 4. It is the server's fault and goes to step 5.

## HttpException

Throw an `HttpException` to answer with a specific status from anywhere in the pipeline.

```ts
import { ConflictException, HttpException, NotFoundException } from '@navios/core'

throw new NotFoundException('User not found')
throw new ConflictException('Email is already registered')
throw new HttpException(418, 'I am a teapot')
throw new HttpException(409, { reason: 'email-taken' })
```

`new HttpException(statusCode, response, cause?)` extends `Error`. `response` is a string or an object, and what is sent depends on the endpoint's `errorSchema`:

| The endpoint declares the status in `errorSchema` | `response` is | Sent                                             |
| ------------------------------------------------- | ------------- | ------------------------------------------------ |
| yes                                               | an object     | The object as the JSON body, as is               |
| no                                                | a string      | A problem with `detail` set to the string        |
| no                                                | an object     | A problem with the object's fields merged in     |
| yes                                               | a string      | A problem with `detail` set to the string        |

The body of a thrown `HttpException` is not type-checked against `errorSchema`. When `NODE_ENV` is not `production` it is validated at run time: a mismatch is logged as an error and the response is sent as thrown. For a type-checked error body, return [`reply(status, body)`](/docs/server/essentials/controllers#declared-error-bodies) from the handler instead.

The subclasses, each with a default message:

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

## Mapping domain errors

Services should throw their own errors and not know about HTTP. A mapper registered on the application turns an error class into a response.

```ts
import { problem, reply } from '@navios/core'

export class UserNotFound extends Error {
  constructor(readonly userId: string) {
    super(`User ${userId} not found`)
  }
}

// The body getUser declares for 404
app.mapError(UserNotFound, (error) => reply(404, { message: error.message }))

// Or a problem response with an extra field
app.mapError(UserNotFound, (error) => problem(404, error.message, { userId: error.userId }))
```

- The mapper receives the error and the `RequestContext`, and returns `reply(status, body)`, `problem(status, detail?, extra?)` or a full `RouteResult`. It may be asynchronous.
- The most specific registered class wins: with mappers for `DomainError` and for `UserNotFound extends DomainError`, a `UserNotFound` uses its own mapper.
- A mapper's `reply()` is sent as JSON as given. It is not checked against the endpoint's `errorSchema` and its status does not have to be declared.
- Mappers run before the built-in handling of `HttpException`, so a mapper registered for `HttpException` or a subclass replaces that handling.
- When a mapper itself throws, the error it threw goes through steps 2 to 5.
- Mappers are not consulted for requests that match no route.

`app.mapError` may be called before or after `init()` and returns the application. A [plugin](/docs/server/guides/plugins) registers mappers through its own API.

## Unexpected errors

An error that reaches step 5 is logged with the request's method and path, and the client receives:

```json
{
  "type": "about:blank",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "An unexpected error occurred"
}
```

The error's message is not sent, because it can contain connection strings, SQL or file paths. With `exposeErrorDetails: true` the message is sent as `detail`, which is useful during development:

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  exposeErrorDetails: process.env.NODE_ENV !== 'production',
})
```

## Stacks of client errors

Capturing a stack costs more than the rest of the request pipeline, and nothing in the framework reads the stack of an error that is answered with a 4xx status. In production, these errors therefore have none: an `HttpException` below 500, a denied guard, and a request that fails validation. Every other error has its stack, including an `HttpException` of 500 or above and a response that does not match its schema.

The `clientErrorStacks` application option changes that. `'development'`, the default, captures stacks unless `NODE_ENV` is `production` when the application initialises; `'always'` and `'never'` do not look at the environment. To find out where a 404 comes from in production:

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  clientErrorStacks: process.env.CLIENT_ERROR_STACKS ? 'always' : 'development',
})
```

An exception is constructed by code that does not know which application will answer it, so the option applies to the process from `init()` until `close()`. With several applications in one process, stacks are captured while any of them wants them.

## Validation errors

A request that fails [validation](/docs/server/essentials/controllers#validation) gets a 400 problem with two extra fields:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Request validation failed for body",
  "source": "body",
  "errors": [{ "path": "email", "message": "Invalid email address" }]
}
```

- `source` is the part of the request that failed: `urlParams`, `query` or `body`.
- `errors` has one entry per issue reported by the schema library, with the issue's path joined by dots and its message unchanged.
- A body that is not valid JSON is reported the same way, with `source: 'body'` and an empty `path`.

In code, the error is a `ValidationError` with `source` and `issues` (the Standard Schema issues). It can be mapped like any other class:

```ts
import { problem, ValidationError } from '@navios/core'

app.mapError(ValidationError, (error) => {
  if (error.source === 'response') {
    throw error
  }
  return problem(422, 'Validation failed', {
    fields: error.issues.map((issue) => issue.message),
  })
})
```

Such a mapper also receives response validation errors, which have `source: 'response'`. Rethrow those, as above, so that they stay a 500.

## Responders

Four framework responses are produced by replaceable singletons:

| Token                               | Used for                        | Default                                |
| ----------------------------------- | ------------------------------- | -------------------------------------- |
| `NotFoundResponderToken`            | a request that matches no route | 404 problem                            |
| `ForbiddenResponderToken`           | a guard returned `false`        | 403 problem                            |
| `ValidationErrorResponderToken`     | request validation failed       | 400 problem with `source` and `errors` |
| `InternalServerErrorResponderToken` | an unexpected error             | 500 problem                            |

A responder implements `ErrorResponder` and is put in place with a provider:

```ts
import { Injectable, NotFoundResponderToken, provide } from '@navios/core'

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

Use a responder to change the format of a whole category of framework errors. Use a mapper for an error class of your own.

## On the client

A client that calls the same declaration sees a declared error body as an `EndpointError` of kind `http` with a typed `body`. A problem response for a status the declaration does not list arrives as kind `http-unknown`, with the problem object as its `body`. See [Errors](/docs/builder/essentials/errors) in the Builder docs.
