---
title: Responses
---

# Responses

A declaration says what a successful call resolves to. Usually that is one JSON schema, but it can also depend on the status, or not be JSON at all. This page covers each form, plus how to read the status and headers of a reply.

Failures are a separate topic: see [Errors](/docs/builder/essentials/errors).

## One JSON schema

`responseSchema` validates the body of a 2xx reply and gives the call its type. The call resolves to the schema's output, so transforms and defaults apply.

```ts
export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

const user = await getUser({ urlParams: { userId: '42' } })
```

A body that does not match fails the call with kind `response-validation`. Your code never receives data that contradicts its type.

A schema in a contract with a Navios server has to accept its own output: see [Responses in a shared contract](/docs/builder/essentials/schemas#responses-in-a-shared-contract).

## A different body per status

When the success body depends on the status, declare `responses` in place of `responseSchema`. Each entry is a schema, or `null` for a status with no body.

```ts
export const saveUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userSchema.omit({ id: true }),
  responses: {
    200: userSchema, // existing user updated
    201: z.object({ id: z.string(), created: z.literal(true) }), // user created
    204: null, // nothing changed
  },
})
```

The call resolves to the union of every entry, with `null` contributing `undefined`. To find out which status came back, use `.safe()` and read `response.status`:

```ts
const res = await saveUser.safe({ urlParams: { userId: '42' }, data })

if (res.ok && res.response.status === 201) {
  // a new user was created
}
```

A 2xx status that is not listed fails the call with kind `response-validation`, the same as a body that does not match its entry.

:::tip
If your API returns different shapes under the same status, describe that in the schema itself with a union, for example `z.discriminatedUnion('type', [...])`. `responses` is only for bodies that differ by status.
:::

## Non-JSON responses

The `response` option changes what the call resolves to. For anything but `'json'` nothing is validated, so declaring a `responseSchema` or `responses` beside it is an error.

| `response`         | Resolves to                   | Typical use                       |
| ------------------ | ----------------------------- | --------------------------------- |
| `'json'` (default) | output of `responseSchema`    | API data                          |
| `'blob'`           | `Blob`                        | file downloads                    |
| `'text'`           | `string`                      | plain text, CSV, HTML             |
| `'stream'`         | `ReadableStream<Uint8Array>`  | large or incremental bodies       |
| `'void'`           | `undefined`                   | 204 and other empty replies       |

```ts
export const deleteUser = API.declareEndpoint({
  method: 'DELETE',
  url: '/users/$userId',
  response: 'void',
})

await deleteUser({ urlParams: { userId: '42' } }) // undefined
```

Builder asks the HTTP client for the matching body type by setting `responseType` on the request. [Downloads and streams](/docs/builder/guides/downloads-and-streams) shows `blob`, `text` and `stream` in use.

## Status and headers

`.safe()` exposes the metadata of the reply as `response`, on success and on failure. It holds `status`, `statusText` and a `Headers` instance. On a failure where nothing came back, it is `null`.

Three helpers read common headers and accept `null`, so you can call them without checking first. Any other header is read from `headers`:

```ts
import { getCookie, getFilename, getRetryAfterMs } from '@navios/builder'

const res = await listUsers.safe()

res.response?.headers.get('x-total-count') ?? null // string | null
getCookie(res.response, 'sid') // string | null, read from Set-Cookie; always null in a browser
getRetryAfterMs(res.response) // number | null, from Retry-After
getFilename(res.response) // string | null, from Content-Disposition
```

Browsers do not let scripts read `Set-Cookie`, so `getCookie` is for servers and other runtimes without that rule.

The throwing form resolves to the data alone. Call `.safe()` when you need the metadata.

## Skipping validation

For high-volume reads from a server you trust, `validateResponse: false` skips the runtime check of the response.

```ts
export const listFeedItems = API.declareEndpoint({
  method: 'GET',
  url: '/feed',
  responseSchema: feedItemsSchema,
  validateResponse: false,
})
```

The result is then typed as the schema's **input**, because transforms and defaults no longer run. Input validation and error handling are unaffected.
