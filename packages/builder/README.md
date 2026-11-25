# @navios/builder

Describe an HTTP endpoint once — method, URL, schemas — and get back a typed function that validates what it sends and what it receives. The same declaration can be called from a client, implemented by a [Navios](https://navios.tech) server controller, and used as a React Query hook.

**[Documentation](https://navios.tech/docs/builder/)** · [Quick start](https://navios.tech/docs/builder/quick-start) · [API reference](https://navios.tech/docs/builder/reference/builder)

## Install

```bash
npm install @navios/builder@next @navios/http@next zod
```

The 2.0 alpha is published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.

`@navios/http` and `zod` are what the examples below use. Any HTTP client with a `request` method works (axios, a `fetch` wrapper), and so does any [Standard Schema](https://standardschema.dev) library (Valibot, ArkType, ...).

## Example

```ts
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { z } from 'zod/v4'

const API = builder({
  client: create({ baseURL: 'https://api.example.com' }),
})

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
})

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: userSchema.omit({ id: true }),
  responseSchema: userSchema,
  errorSchema: {
    409: z.object({ message: z.string() }),
  },
})

const user = await getUser({ urlParams: { userId: '42' } })
//    ^? { id: string; name: string; email: string }
```

Arguments, results and error bodies are inferred from the URL template and the schemas. Input is validated before a request is sent, and then sent as you passed it; the response is validated before your code sees it.

## Handling failures

Every failed call produces one type, `EndpointError`, with a `kind` that says what went wrong: an HTTP status, invalid input, an invalid response, a network failure, a timeout, a cancellation.

Call the endpoint and it throws. Call `.safe()` and it never throws:

```ts
const res = await createUser.safe({
  data: { name: 'Ada', email: 'ada@example.com' },
})

if (res.ok) {
  res.data.id
} else if (res.error.kind === 'http' && res.error.status === 409) {
  res.error.body.message // typed from errorSchema[409]
} else {
  console.error(res.error.kind, res.error.message)
}
```

## What else it does

| Need                                           | How                                                                        | Docs                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Query strings, request bodies, URL params      | `querySchema`, `requestSchema`, `urlParamsSchema`                          | [Inputs](https://navios.tech/docs/builder/essentials/inputs)                           |
| A different body per status, or no body        | `responses`, `response: 'void'`                                            | [Responses](https://navios.tech/docs/builder/essentials/responses)                     |
| File uploads                                   | `body: 'multipart'`                                                        | [File uploads](https://navios.tech/docs/builder/guides/file-uploads)                   |
| Downloads, text, streams                       | `response: 'blob' \| 'text' \| 'stream'`                                   | [Downloads and streams](https://navios.tech/docs/builder/guides/downloads-and-streams) |
| Typed error bodies, logging                    | `errorSchema`, `onError`                                                   | [Errors](https://navios.tech/docs/builder/essentials/errors)                           |
| Another HTTP client, auth, per-request clients | `builder({ client })`, `endpoint(args, { client })`                        | [HTTP client](https://navios.tech/docs/builder/essentials/http-client)                 |
| Another schema library                         | any Standard Schema, mixed per slot                                        | [Schemas](https://navios.tech/docs/builder/essentials/schemas)                         |
| One contract for client and server             | `@Endpoint(getUser)` in `@navios/server`                                   | [Sharing with Navios Server](https://navios.tech/docs/builder/guides/navios-server)    |
| React hooks                                    | [`@navios/react-query`](https://www.npmjs.com/package/@navios/react-query) | [React Query](https://navios.tech/docs/builder/react-query/)                           |
| Typed WebSocket messages                       | `@navios/builder/socket`                                                   | [WebSocket](https://navios.tech/docs/builder/realtime/websocket)                       |
| Typed Server-Sent Events                       | `@navios/builder/eventsource`                                              | [Server-Sent Events](https://navios.tech/docs/builder/realtime/server-sent-events)     |

## Upgrading from 1.x

2.0 has one way to declare an endpoint, two ways to call it and one error type. See [Migrating to 2.0](https://navios.tech/docs/builder/reference/migrating-to-2) for before-and-after examples, or [CHANGELOG.md](./CHANGELOG.md) for the full list.

## License

MIT
