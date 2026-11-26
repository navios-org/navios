---
title: Errors
---

# Errors

Every failed call produces one type, `EndpointError`. The throwing form throws it, `.safe()` returns it as `result.error`, and the builder's `onError` hook receives the same instance. This page lists what can go wrong and shows how to give error bodies a type.

## Error kinds

`error.kind` says why the call failed. Switch on it first.

| `kind`                | What happened                                                                                                             | `status` and `body`          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `http`                | Non-2xx status that has an `errorSchema` entry, and the body matched it                                                   | status, typed body           |
| `http-unknown`        | Non-2xx status with no `errorSchema` entry                                                                                | status, raw body             |
| `request-validation`  | `urlParams`, `params` or `data` failed its schema. Nothing was sent                                                       | —                            |
| `response-validation` | A 2xx body failed its schema, a 2xx body could not be parsed by the client, a 2xx status is missing from `responses`, or an error body failed its `errorSchema` entry | status, raw body |
| `network`             | No complete response was received, or an interceptor of the HTTP client threw                                             | —                            |
| `timeout`             | The request timed out                                                                                                     | —                            |
| `aborted`             | The request was cancelled through its `AbortSignal`                                                                       | —                            |
| `config`              | The call could not be made: no HTTP client, a missing or unusable URL parameter, or a body that cannot be serialised      | —                            |

Every error also carries:

| Field      | Content                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------- |
| `endpoint` | `{ method, url }` of the declaration, with the URL as a template                          |
| `response` | `{ status, statusText, headers }`, or `null` when no response was received                |
| `issues`   | For the two validation kinds: a list of `{ message, path?, part? }`                       |
| `cause`    | The original thrown value. For a schema failure what the library reported: the `ZodError` of a Zod schema, the issues of any other |
| `message`  | A readable summary, such as `GET /users/$userId failed with status 404`                   |

`EndpointError` extends `NaviosError`, which extends `Error`.

## Typed error bodies

Without an `errorSchema`, every non-2xx reply is `http-unknown` and its `body` is `unknown`. Map statuses to schemas and those replies become kind `http` with a typed body.

```ts
export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: userSchema.omit({ id: true }),
  responseSchema: userSchema,
  errorSchema: {
    409: z.object({ message: z.string(), conflictWith: z.string() }),
    422: z.object({ fields: z.record(z.string(), z.string()) }),
  },
})
```

Narrowing on `kind` and then `status` narrows `body`:

```ts
const res = await createUser.safe({ data })

if (!res.ok) {
  const { error } = res

  if (error.kind === 'http' && error.status === 409) {
    error.body.conflictWith // string
  } else if (error.kind === 'http' && error.status === 422) {
    error.body.fields // Record<string, string>
  } else if (error.kind === 'http-unknown') {
    error.status // number
    error.body // unknown
  }
}
```

`error.body` is exactly what the schema produced. Builder adds nothing to it.

An error body that does not match its schema is reported as `response-validation`, because the server broke the contract.

## In a catch block

A caught value is `unknown`, so the typing above is lost. Two guards bring it back.

```ts
import { isEndpointError, isHttpError } from '@navios/builder'

try {
  await createUser({ data })
} catch (error) {
  if (isHttpError<typeof createUser.config.errorSchema, 409>(error, 409)) {
    error.body.conflictWith // typed from errorSchema[409]
  } else if (isEndpointError(error) && error.kind === 'aborted') {
    // cancelled on purpose: nothing to report
  } else {
    throw error
  }
}
```

- `isEndpointError(value)` narrows to `EndpointError`.
- `isHttpError(value, status?)` narrows to kind `http`. Give it the endpoint's `errorSchema` type and a status to also narrow `body`.

If you find yourself writing more than one guard for the same call, `.safe()` is usually the shorter path. [How it works](/docs/builder/how-it-works#two-ways-to-call) compares the two forms.

## Validation issues

Both validation kinds carry `issues`, in the same shape whichever schema library produced them. The issues of `request-validation` name the `part` of the arguments they belong to, `'urlParams'`, `'params'` or `'data'`, and `path` starts inside it.

```ts
const res = await createUser.safe({ data: { name: '', email: 'nope' } })

if (!res.ok && res.error.kind === 'request-validation') {
  for (const issue of res.error.issues) {
    console.log(issue.part, issue.path, issue.message) // 'data', ['email'], 'Invalid email address'
  }
}
```

`request-validation` means your code passed bad input. `response-validation` means the server sent something the declaration does not allow; its `body` holds the raw payload so you can see what arrived.

## Reporting with onError

`onError` is a telemetry hook on the builder. It is called once per failed call, with the same instance the caller receives, for both call forms.

```ts
export const API = builder({
  client,
  onError: (error) => {
    if (error.kind === 'aborted') return
    logger.warn(error.toJSON())
  },
})
```

It cannot change the outcome of a call. An exception thrown inside it is caught and logged.

Its second argument holds the request that was sent, for logs that need the bound URL or the query rather than the URL template in `error.endpoint`. It is `null` when the call failed before a request was built: invalid input, no client, a URL parameter that cannot be bound.

```ts
export const API = builder({
  client,
  onError: (error, { request }) => {
    if (error.kind === 'response-validation') {
      console.error(`Unexpected response from ${request?.method} ${request?.url}`, error.issues)
    }
  },
})
```

The request is not part of the error, because its headers may carry credentials. Log only the fields you need from it.

`error.toJSON()` returns a plain object without `cause`, with headers flattened to a record and `set-cookie` left out. Its `issues` never contain the validated values. It is safe to pass to `JSON.stringify`, a logger, or across a server boundary.

## Reacting to specific failures

Two patterns come up often enough to show.

Retry when the server says when:

```ts
import { getRetryAfterMs } from '@navios/builder'

const res = await listUsers.safe()

if (!res.ok && res.error.status === 429) {
  const delay = getRetryAfterMs(res.response) ?? 1_000
  await new Promise((resolve) => setTimeout(resolve, delay))
  // call again
}
```

Tell transient failures from permanent ones:

```ts
function isRetryable(error: EndpointError): boolean {
  if (error.kind === 'network' || error.kind === 'timeout') return true
  return error.status !== undefined && error.status >= 500
}
```
