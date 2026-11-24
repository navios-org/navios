---
title: Uploads and downloads
---

# Uploads and downloads

An upload is a mutation on a `body: 'multipart'` endpoint, and a download is a mutation or a query on a `response: 'blob'` endpoint. There is no separate API for either. This page shows the React side: wiring a file input, starting a download from a click, and showing a cached file. How the endpoints themselves work is covered in [File uploads](/docs/builder/guides/file-uploads) and [Downloads and streams](/docs/builder/guides/downloads-and-streams).

## Upload from a file input

```ts
// client and userQuery from the React Query quick start
export const useUploadAvatar = client.mutation({
  method: 'POST',
  url: '/users/$userId/avatar',
  body: 'multipart',
  requestSchema: z.object({
    file: z
      .instanceof(File)
      .refine((file) => file.size <= 5 * 1024 * 1024, 'The image must be 5 MB or smaller'),
  }),
  responseSchema: z.object({ url: z.string() }),
  invalidates: [(_data, variables) => userQuery.key({ urlParams: variables.urlParams })],
})
```

Pass the `File` from the input straight to `mutate`:

```tsx
function AvatarUpload({ userId }: { userId: string }) {
  const { mutate, isPending, error } = useUploadAvatar()

  return (
    <>
      <input
        type="file"
        accept="image/*"
        disabled={isPending}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) mutate({ urlParams: { userId }, data: { file } })
          event.target.value = '' // lets the user pick the same file again
        }}
      />
      {isPending && <p>Uploading…</p>}
      {error?.kind === 'request-validation' && (
        <p role="alert">{error.issues[0]?.message}</p>
      )}
    </>
  )
}
```

A file the schema rejects is never sent. The mutation fails with a `request-validation` error whose `issues` carry the messages from the schema, so the same declaration validates in the browser and documents the limit.

For several files, make the field an array and read all of `event.target.files`:

```ts
requestSchema: z.object({ files: z.array(z.instanceof(File)), folder: z.string() })
```

```tsx
<input
  type="file"
  multiple
  onChange={(event) =>
    mutate({ data: { files: Array.from(event.target.files ?? []), folder: 'inbox' } })
  }
/>
```

## Upload as part of a form

When the file is one field among others, read everything from the form on submit. A `FormData` entry for a file input is already a `File`.

```tsx
function AvatarForm({ userId }: { userId: string }) {
  const { mutate, isPending } = useUploadAvatar()

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const file = new FormData(event.currentTarget).get('avatar')
        if (file instanceof File) mutate({ urlParams: { userId }, data: { file } })
      }}
    >
      <input type="file" name="avatar" accept="image/*" required />
      <button disabled={isPending}>Upload</button>
    </form>
  )
}
```

## Download on a click

A download that starts from a user action is a mutation, even though its method is `GET`: nothing should be fetched until the click, and the file does not belong in the cache.

```ts
export const useDownloadReport = client.mutation({
  method: 'GET',
  url: '/reports/$reportId/download',
  response: 'blob',
  withResponse: true,
})
```

`withResponse: true` is optional. It is here to read the file name the server sends in `content-disposition`.

```tsx
function DownloadButton({ reportId }: { reportId: string }) {
  const { mutate, isPending, error } = useDownloadReport()

  const download = () =>
    mutate(
      { urlParams: { reportId } },
      {
        onSuccess: ({ data: blob, response }) => {
          const disposition = response.headers['content-disposition'] ?? ''
          const link = document.createElement('a')
          link.href = URL.createObjectURL(blob)
          link.download = /filename="?([^";]+)/.exec(disposition)?.[1] ?? 'report.pdf'
          link.click()
          URL.revokeObjectURL(link.href)
        },
      },
    )

  return (
    <>
      <button disabled={isPending} onClick={download}>
        {isPending ? 'Preparing…' : 'Download'}
      </button>
      {error && <p role="alert">Download failed: {error.message}</p>}
    </>
  )
}
```

The saving itself is plain browser code; [Downloads and streams](/docs/builder/guides/downloads-and-streams) explains it. A failed download is an `EndpointError` like any other, and an `errorSchema` on the endpoint types its body.

## Show a cached file

Use a query when the file is displayed and worth caching, such as a preview or an avatar behind authentication. The data is a `Blob`; turn it into an object URL for as long as the component shows it.

```tsx
export const avatarQuery = client.query({
  method: 'GET',
  url: '/users/$userId/avatar',
  response: 'blob',
})

function Avatar({ userId }: { userId: string }) {
  const { data: blob } = avatarQuery.use({ urlParams: { userId } }, { staleTime: Infinity })
  const [src, setSrc] = useState<string>()

  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  return src ? <img src={src} alt="" /> : <span className="avatar-placeholder" />
}
```

Two limits follow from what a cache is:

- A `Blob` is not JSON. Leave blob queries out of server-side dehydration and persisted caches.
- Do not use `response: 'stream'` with a query. A stream can be read once, so a cached one is useless to the second reader. Use a mutation.

`response: 'text'` has neither limit; a text query caches a plain string.
