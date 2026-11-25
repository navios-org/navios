---
title: Declaring endpoints
---

# Declaring endpoints

`API.declareEndpoint(options)` is the only way to declare an HTTP endpoint. This page is the map of what `options` can contain. The larger topics have their own pages; the smaller ones are covered here.

## Method and URL

Every declaration needs a `method` and a `url`. The method is one of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` or `OPTIONS`. The URL is a path relative to the client's base URL, with `$name` marking URL parameters.

```ts
// API and userSchema come from the Quick start
export const deleteUser = API.declareEndpoint({
  method: 'DELETE',
  url: '/users/$userId',
  response: 'void',
})
```

## The options at a glance

| Option             | What it does                                                    | Covered in                                                               |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `method`, `url`    | Identify the endpoint                                           | this page                                                                |
| `urlParamsSchema`  | Validates and types the `$name` values                          | [Inputs](/docs/builder/essentials/inputs#url-parameters)                 |
| `querySchema`      | Validates and types the query string (`params`)                 | [Inputs](/docs/builder/essentials/inputs#query-parameters)               |
| `requestSchema`    | Validates and types the body (`data`)                           | [Inputs](/docs/builder/essentials/inputs#request-body)                   |
| `body`             | `'json'` (default) or `'multipart'`                             | [File uploads](/docs/builder/guides/file-uploads)                        |
| `responseSchema`   | Validates and types a JSON response                             | [Responses](/docs/builder/essentials/responses)                          |
| `responses`        | Per-status success schemas, instead of `responseSchema`         | [Responses](/docs/builder/essentials/responses#a-different-body-per-status) |
| `response`         | `'json'` (default), `'blob'`, `'text'`, `'stream'` or `'void'`  | [Responses](/docs/builder/essentials/responses#non-json-responses)       |
| `validateResponse` | `false` skips the runtime check of the response                 | [Responses](/docs/builder/essentials/responses#skipping-validation)      |
| `errorSchema`      | Schemas for error bodies, by status                             | [Errors](/docs/builder/essentials/errors#typed-error-bodies)             |
| `headers`          | Headers sent with every call                                    | this page                                                                |
| `timeout`          | Timeout in milliseconds                                         | this page                                                                |
| `clientOptions`    | Extra keys for your HTTP client                                 | this page                                                                |

A `responseSchema` is required unless the declaration has `responses` or a non-JSON `response` kind. Any key that is not in this table is a compile error, so a typo such as `requstSchema` cannot slip through.

## Headers and timeout

`headers` and `timeout` set defaults for one endpoint. A call can override both: per-call headers are merged over the endpoint's, and a per-call timeout wins.

```ts
export const exportUsers = API.declareEndpoint({
  method: 'POST',
  url: '/users/export',
  responseSchema: z.object({ jobId: z.string() }),
  headers: { 'X-Feature': 'export' },
  timeout: 30_000,
})

await exportUsers({ timeout: 60_000, headers: { 'X-Trace': traceId } })
```

Headers that every endpoint needs, such as authorization, belong on the [HTTP client](/docs/builder/essentials/http-client#authentication) rather than on each declaration.

## Client options

`clientOptions` passes keys through to your HTTP client that Builder itself has no opinion about, such as axios `withCredentials` or fetch `credentials`.

```ts
export const getSession = API.declareEndpoint({
  method: 'GET',
  url: '/session',
  responseSchema: z.object({ userId: z.string() }),
  clientOptions: { withCredentials: true },
})
```

It cannot override what Builder controls: `method`, `url`, `params`, `data`, `signal`, `timeout` and `responseType` are always set from the declaration and the call. `headers` in `clientOptions` are sent, merged underneath the endpoint's `headers` and the headers of the call.

## Reading a declaration back

The options object is available unchanged as `endpoint.config`. Use it to build tooling on top of your declarations, or to reuse a schema.

```ts
getUser.config.method // 'GET'
getUser.config.url // '/users/$userId'
getUser.config.responseSchema // userSchema
```

## Type helpers

When you need the types of an endpoint elsewhere — a function parameter, a component prop — derive them from the declaration.

```ts
import type {
  EndpointConfig,
  EndpointErrorType,
  EndpointParams,
  EndpointResult,
} from '@navios/builder'

type GetUserArgs = EndpointParams<typeof getUser> // { urlParams: { userId: string | number }, ... }
type User = EndpointResult<typeof getUser> // { id: string; name: string; email: string }
type GetUserError = EndpointErrorType<typeof getUser> // the typed EndpointError union
type GetUserConfig = EndpointConfig<typeof getUser> // the declared options
```

```ts
async function loadUser(args: EndpointParams<typeof getUser>): Promise<User> {
  return getUser(args)
}
```
