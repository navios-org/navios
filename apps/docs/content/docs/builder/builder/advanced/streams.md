# Non-JSON Responses

Not every endpoint answers with JSON. The `response` option of `declareEndpoint` selects what an endpoint resolves to: a `Blob` for file downloads, a `string`, a `ReadableStream`, or nothing at all.

## Response Kinds

| `response`         | Resolves to                  | `responseSchema` |
| ------------------ | ---------------------------- | ---------------- |
| `'json'` (default) | `z.output<responseSchema>`   | required         |
| `'blob'`           | `Blob`                       | not used         |
| `'text'`           | `string`                     | not used         |
| `'stream'`         | `ReadableStream<Uint8Array>` | not used         |
| `'void'`           | `undefined`                  | not used         |

Everything else about the endpoint is unchanged: URL parameters, `querySchema`, `requestSchema`, `errorSchema`, `safe()`, and the error model all work the same way.

```typescript
const downloadFile = API.declareEndpoint({
  method: 'GET',
  url: '/files/$fileId/download',
  response: 'blob',
})

const blob = await downloadFile({ urlParams: { fileId: '123' } })
```

For `'blob'`, `'text'` and `'stream'` the builder passes a matching `responseType` to the HTTP client, which is responsible for reading the body in that form.

## Downloading Files

### Basic Download

```typescript
const downloadFile = API.declareEndpoint({
  method: 'GET',
  url: '/files/$fileId/download',
  response: 'blob',
})

async function download(fileId: string) {
  const blob = await downloadFile({ urlParams: { fileId } })

  // Create download link
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'file.pdf'
  a.click()
  URL.revokeObjectURL(url)
}
```

### With Query Parameters

```typescript
const downloadFile = API.declareEndpoint({
  method: 'GET',
  url: '/files/$fileId/download',
  querySchema: z.object({
    format: z.enum(['pdf', 'docx']).optional(),
    quality: z.enum(['low', 'high']).optional(),
  }),
  response: 'blob',
})

const blob = await downloadFile({
  urlParams: { fileId: '123' },
  params: { format: 'pdf', quality: 'high' },
})
```

### With a Request Body

```typescript
const generateReport = API.declareEndpoint({
  method: 'POST',
  url: '/reports/generate',
  requestSchema: z.object({
    startDate: z.string(),
    endDate: z.string(),
    format: z.enum(['pdf', 'xlsx']),
  }),
  response: 'blob',
})

const blob = await generateReport({
  data: { startDate: '2024-01-01', endDate: '2024-12-31', format: 'pdf' },
})
```

### Using the Server's File Name

`safe()` gives you the response headers next to the data, so you can honour `Content-Disposition`:

```typescript
import { getHeader } from '@navios/builder'

async function download(fileId: string) {
  const result = await downloadFile.safe({ urlParams: { fileId } })
  if (!result.ok) {
    showError('Download failed')
    return
  }

  const disposition = getHeader(result.response, 'content-disposition')
  const filename = disposition?.match(/filename="?([^"]+)"?/)?.[1] ?? 'download'

  const url = URL.createObjectURL(result.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

### Preview in the Browser

```typescript
const getImage = API.declareEndpoint({
  method: 'GET',
  url: '/images/$imageId',
  response: 'blob',
})

const blob = await getImage({ urlParams: { imageId: '123' } })

const img = document.createElement('img')
img.src = URL.createObjectURL(blob)
img.onload = () => URL.revokeObjectURL(img.src)
document.body.appendChild(img)
```

## Text

```typescript
const exportCsv = API.declareEndpoint({
  method: 'GET',
  url: '/reports/$reportId.csv',
  response: 'text',
})

const csv = await exportCsv({ urlParams: { reportId: '123' } })
const rows = csv.split('\n')
```

## Streams

`response: 'stream'` resolves to a `ReadableStream<Uint8Array>`, so you can process the body while it downloads:

```typescript
const tailLogs = API.declareEndpoint({
  method: 'GET',
  url: '/jobs/$jobId/logs',
  response: 'stream',
})

const controller = new AbortController()

const stream = await tailLogs({
  urlParams: { jobId: '42' },
  signal: controller.signal,
})

const reader = stream.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  appendToConsole(decoder.decode(value, { stream: true }))
}
```

Call `controller.abort()` to stop reading early.

:::tip
For Server-Sent Events, use the dedicated [EventSource builder](/docs/builder/builder/advanced/eventsource), which adds typed events and reconnection handling.
:::

## Empty Responses

Use `response: 'void'` for endpoints that answer without a body, such as `204 No Content`. The endpoint resolves to `undefined` and the body, if any, is ignored:

```typescript
const deleteFile = API.declareEndpoint({
  method: 'DELETE',
  url: '/files/$fileId',
  response: 'void',
})

await deleteFile({ urlParams: { fileId: '123' } })
```

## Error Handling

A non-2xx status fails the call like on any other endpoint, and `errorSchema` gives the error body a type:

```typescript
const downloadFile = API.declareEndpoint({
  method: 'GET',
  url: '/files/$fileId/download',
  response: 'blob',
  errorSchema: {
    404: z.object({ message: z.string() }),
  },
})

const result = await downloadFile.safe({ urlParams: { fileId: '123' } })

if (!result.ok) {
  if (result.error.kind === 'http' && result.error.status === 404) {
    showError(result.error.body.message)
  } else {
    showError('Download failed')
  }
}
```

:::note
`errorSchema` validates the error body as your HTTP client delivers it. If your client returns error bodies of a blob endpoint as a `Blob` rather than parsed JSON, the body will not match the schema and the failure is reported as `response-validation`.
:::

## Best Practices

### Always Revoke Object URLs

```typescript
// ✅ Good - revoke URL after use
const blob = await downloadFile({ urlParams: { fileId: '123' } })
const url = URL.createObjectURL(blob)
// ... use url
URL.revokeObjectURL(url)

// ❌ Bad - memory leak
const blob = await downloadFile({ urlParams: { fileId: '123' } })
const url = URL.createObjectURL(blob)
// Never revokes URL
```

### Prefer `'stream'` for Large Payloads

A `'blob'` endpoint buffers the whole body in memory before it resolves. For large files, read a `'stream'` endpoint chunk by chunk instead.

### Give Slow Downloads a Timeout

```typescript
const downloadArchive = API.declareEndpoint({
  method: 'GET',
  url: '/archives/$archiveId',
  response: 'blob',
  timeout: 120000,
})
```

## Next Steps

- [Multipart Uploads](/docs/builder/builder/advanced/multipart) - Upload files
- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - Review endpoint basics
- [Error Handling](/docs/builder/builder/guides/error-handling) - The error model
