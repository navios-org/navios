---
sidebar_position: 1
---

# Stream Handling

Stream endpoints return binary data (Blob) instead of JSON. You can use them with mutations to download files.

## Basic Stream Mutation

Create a mutation from a stream endpoint:

```typescript
// shared/endpoints/files.ts
export const downloadFileEndpoint = API.declareStream({
  method: 'GET',
  url: '/files/$fileId/download',
})
```

```typescript
// client/mutations/files.ts
const downloadFileMutation = client.mutationFromEndpoint(downloadFileEndpoint, {
  processResponse: (blob) => blob,
})
```

## Usage

```typescript
function DownloadButton({ fileId }: { fileId: string }) {
  const { mutate, isPending, data } = downloadFileMutation()

  // Handle download when data is received
  useEffect(() => {
    if (data) {
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'file.pdf'
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [data])

  return (
    <button
      onClick={() => mutate({ urlParams: { fileId } })}
      disabled={isPending}
    >
      {isPending ? 'Downloading...' : 'Download'}
    </button>
  )
}
```

## With onSuccess Callback

Define download logic at declaration time:

```typescript
const downloadFileMutation = client.mutationFromEndpoint(downloadFileEndpoint, {
  processResponse: (blob) => blob,
  onSuccess: (blob) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'file.pdf'
    a.click()
    URL.revokeObjectURL(url)
  },
})
```

## With Filename

```typescript
function DownloadButton({ fileId, filename }: { fileId: string; filename: string }) {
  const { mutate, isPending, data } = downloadFileMutation()

  useEffect(() => {
    if (data) {
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [data, filename])

  return (
    <button onClick={() => mutate({ urlParams: { fileId } })} disabled={isPending}>
      Download
    </button>
  )
}
```

## Preview Before Download

```typescript
function FilePreview({ fileId }: { fileId: string }) {
  const { mutate, isPending, data } = downloadFileMutation()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (data) {
      const url = URL.createObjectURL(data)
      setPreviewUrl(url)
      
      // Cleanup
      return () => {
        URL.revokeObjectURL(url)
        setPreviewUrl(null)
      }
    }
  }, [data])

  const handleDownload = () => {
    if (previewUrl) {
      const a = document.createElement('a')
      a.href = previewUrl
      a.download = 'file.pdf'
      a.click()
    }
  }

  return (
    <div>
      <button onClick={() => mutate({ urlParams: { fileId } })} disabled={isPending}>
        {isPending ? 'Loading...' : 'Preview'}
      </button>
      {previewUrl && (
        <div>
          <iframe src={previewUrl} />
          <button onClick={handleDownload}>Download</button>
        </div>
      )}
    </div>
  )
}
```

## Next Steps

- [Multipart Mutations](/docs/builder/react-query/guides/multipart-mutations) - Upload files
- [Mutations](/docs/builder/react-query/guides/mutations) - Basic mutations

