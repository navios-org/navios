---
title: Downloads and streams
---

# Downloads and streams

When an endpoint returns something other than JSON, set its `response` kind. The call then resolves to a `Blob`, a `string` or a `ReadableStream` instead of schema output. The kinds are listed in [Responses](/docs/builder/essentials/responses#non-json-responses); this page shows them in use.

Inputs and errors work exactly as for JSON endpoints. Only the success value changes, and no `responseSchema` is involved.

## Downloading a file

`response: 'blob'` resolves to a `Blob`.

```ts
export const downloadInvoice = API.declareEndpoint({
  method: 'GET',
  url: '/invoices/$invoiceId/pdf',
  response: 'blob',
})

const blob = await downloadInvoice({ urlParams: { invoiceId: '2026-001' } })
```

In a browser, saving it means pointing a temporary link at an object URL:

```ts
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
```

To use the filename the server suggests, call `.safe()` and read the `Content-Disposition` header:

```ts
import { getHeader } from '@navios/builder'

const res = await downloadInvoice.safe({ urlParams: { invoiceId: '2026-001' } })

if (res.ok) {
  const disposition = getHeader(res.response, 'content-disposition')
  const filename = disposition?.match(/filename="?([^";]+)"?/)?.[1] ?? 'invoice.pdf'
  saveBlob(res.data, filename)
}
```

A download that takes a body is declared the same way, with a `requestSchema`:

```ts
export const exportUsers = API.declareEndpoint({
  method: 'POST',
  url: '/users/export',
  requestSchema: z.object({ format: z.enum(['csv', 'xlsx']), ids: z.array(z.string()) }),
  response: 'blob',
})
```

## Reading text

`response: 'text'` resolves to a `string`. Use it for CSV, plain text, HTML or any format you parse yourself.

```ts
export const getRobots = API.declareEndpoint({
  method: 'GET',
  url: '/robots.txt',
  response: 'text',
})

const text = await getRobots()
```

## Consuming a stream

`response: 'stream'` resolves to a `ReadableStream<Uint8Array>` as soon as the headers arrive, so you can process a large or slow body as it comes in.

```ts
export const tailLogs = API.declareEndpoint({
  method: 'GET',
  url: '/logs',
  querySchema: z.object({ service: z.string() }),
  response: 'stream',
})

const stream = await tailLogs({ params: { service: 'api' } })
const reader = stream.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  console.log(decoder.decode(value, { stream: true }))
}
```

Pass a `signal` to stop reading early. Aborting it cancels the request. With `@navios/http`, a `timeout` covers the time until the headers arrive, not the reading of the stream. Read a stream to its end or cancel it, so that its connection and its listener on your `signal` are released.

For a stream of discrete server events, the [Server-Sent Events](/docs/builder/realtime/server-sent-events) builder gives you typed, validated events instead of raw bytes.

## When the download fails

A non-2xx reply produces the same `EndpointError` as on any endpoint, so `error.kind` and `error.status` work as usual.

The error **body** needs care, because its form depends on the HTTP client. `@navios/http` reads an error body as text and parses it when the server sent JSON, `application/problem+json` included, whatever the endpoint asked for. A client that reads it in the format the endpoint asked for, as axios does, returns a `Blob` on a `'blob'` endpoint even if the server sent JSON. Branch on the status, and decode the body yourself when it is a `Blob` and you need its content:

```ts
const res = await downloadInvoice.safe({ urlParams: { invoiceId: '2026-001' } })

if (!res.ok && res.error.status === 404) {
  const body = res.error.body
  const message = body instanceof Blob ? await body.text() : String(body)
  showError(message)
}
```

An `errorSchema` entry is validated against whatever the client returned, so with a client that returns a `Blob` a schema that expects an object will not match.

## Client requirements

Builder sets `responseType` on the request (`'blob'`, `'text'` or `'stream'`), and the HTTP client has to honor it. `@navios/http` and axios do. A hand-written `fetch` wrapper must branch on `config.responseType` and return `response.blob()`, `response.text()` or `response.body` as `data`, as [this one](/docs/builder/essentials/http-client#choosing-a-client) does.

Using downloads from React components is covered in [Uploads and downloads](/docs/builder/react-query/uploads-and-downloads).
