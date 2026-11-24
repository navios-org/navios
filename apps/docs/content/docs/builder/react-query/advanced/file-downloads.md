---
sidebar_position: 1
---

# File Downloads

An endpoint that does not return JSON declares its `response` kind instead of a `responseSchema`. The data type follows from it:

| `response` | Data                         |
| ---------- | ---------------------------- |
| `'blob'`   | `Blob`                       |
| `'text'`   | `string`                     |
| `'stream'` | `ReadableStream<Uint8Array>` |
| `'void'`   | `undefined`                  |

Such endpoints work with `client.query` and `client.mutation` like any other.

## Download on Demand

Use a mutation when the download starts from a user action:

```typescript
const downloadFile = client.mutation({
  method: 'GET',
  url: '/files/$fileId/download',
  response: 'blob',
  onSuccess: (blob) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'file.pdf'
    link.click()
    URL.revokeObjectURL(url)
  },
})

function DownloadButton({ fileId }: { fileId: string }) {
  const { mutate, isPending } = downloadFile()

  return (
    <button onClick={() => mutate({ urlParams: { fileId } })} disabled={isPending}>
      {isPending ? 'Downloading...' : 'Download'}
    </button>
  )
}
```

### From an Existing Endpoint

```typescript
// shared/endpoints/files.ts
export const downloadFileEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/files/$fileId/download',
  response: 'blob',
})

// client/mutations/files.ts
const downloadFile = client.mutation(downloadFileEndpoint)
```

### With a File Name

Pass the name through a hook to the callback with `useContext`, or handle the result where you call `mutateAsync`:

```typescript
function DownloadButton({ fileId, fileName }: { fileId: string; fileName: string }) {
  const { mutateAsync, isPending } = downloadFile()

  const handleClick = async () => {
    const blob = await mutateAsync({ urlParams: { fileId } })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button onClick={handleClick} disabled={isPending}>
      Download
    </button>
  )
}
```

## Cached Binary Data

Use a query when the file is displayed and should be cached, for example an image preview:

```typescript
import { useEffect, useState } from 'react'

const getFilePreview = client.query({
  method: 'GET',
  url: '/files/$fileId/preview',
  response: 'blob',
})

function FilePreview({ fileId }: { fileId: string }) {
  const { data: blob, isPending } = getFilePreview.use(
    { urlParams: { fileId } },
    { staleTime: Infinity },
  )
  const [src, setSrc] = useState<string>()

  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  if (isPending) return <div>Loading preview...</div>
  return <img src={src} alt="Preview" />
}
```

:::caution
Do not use `response: 'stream'` with a query. A `ReadableStream` can be read once, so a cached stream is useless to the second reader. Use a mutation for streams.
:::

## Text Responses

```typescript
const getChangelog = client.query({
  method: 'GET',
  url: '/changelog.md',
  response: 'text',
})

const { data } = getChangelog.use() // string | undefined
```

## Errors

A failed download is an `EndpointError` like any other failure, and `errorSchema` applies to it:

```typescript
const downloadFile = client.mutation({
  method: 'GET',
  url: '/files/$fileId/download',
  response: 'blob',
  errorSchema: {
    404: z.object({ message: z.string() }),
  },
})

const { error } = downloadFile()

if (error?.kind === 'http' && error.status === 404) {
  error.body.message
}
```

## Next Steps

- [File Uploads](/docs/builder/react-query/guides/file-uploads) - Multipart mutations
- [Mutations](/docs/builder/react-query/guides/mutations) - Mutation settings and callbacks
- [Typed Errors](/docs/builder/react-query/advanced/error-schemas) - Every error kind
