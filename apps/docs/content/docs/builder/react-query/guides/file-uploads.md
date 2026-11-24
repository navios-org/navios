# File Uploads

An upload is a regular mutation on an endpoint declared with `body: 'multipart'`. The request body is sent as `multipart/form-data`; everything else — variables, callbacks, `invalidates`, typed errors — works as in any other [mutation](/docs/builder/react-query/guides/mutations).

## Basic Upload

```typescript
const uploadAvatar = client.mutation({
  method: 'POST',
  url: '/users/$userId/avatar',
  body: 'multipart',
  requestSchema: z.object({
    file: z.instanceof(File),
  }),
  responseSchema: z.object({
    url: z.string(),
  }),
})
```

## Usage

```typescript
function AvatarUpload({ userId }: { userId: string }) {
  const { mutate, isPending, error } = uploadAvatar()

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      mutate({ urlParams: { userId }, data: { file } })
    }
  }

  return (
    <div>
      <input type="file" accept="image/*" onChange={handleChange} disabled={isPending} />
      {isPending && <div>Uploading...</div>}
      {error && <div>Error: {error.message}</div>}
    </div>
  )
}
```

## From an Existing Endpoint

```typescript
// shared/endpoints/files.ts
export const uploadDocumentEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/documents',
  body: 'multipart',
  requestSchema: z.object({
    file: z.instanceof(File),
    title: z.string(),
  }),
  responseSchema: documentSchema,
})

// client/mutations/files.ts
const uploadDocument = client.mutation(uploadDocumentEndpoint, {
  invalidates: [listDocuments],
})
```

## Extra Fields and Multiple Files

Every key of `requestSchema` becomes a form field:

```typescript
const uploadDocuments = client.mutation({
  method: 'POST',
  url: '/documents',
  body: 'multipart',
  requestSchema: z.object({
    files: z.array(z.instanceof(File)),
    category: z.string(),
  }),
  responseSchema: z.object({
    documents: z.array(documentSchema),
  }),
})

function DocumentUpload() {
  const { mutate, isPending } = uploadDocuments()

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length > 0) {
      mutate({ data: { files, category: 'general' } })
    }
  }

  return <input type="file" multiple onChange={handleChange} disabled={isPending} />
}
```

## File Validation

Validate files in the schema. A file that fails validation is never sent; the mutation fails with `error.kind === 'request-validation'`:

```typescript
const uploadAvatar = client.mutation({
  method: 'POST',
  url: '/users/$userId/avatar',
  body: 'multipart',
  requestSchema: z.object({
    file: z
      .instanceof(File)
      .refine((file) => file.size <= 5 * 1024 * 1024, 'File must be 5MB or less')
      .refine((file) => file.type.startsWith('image/'), 'File must be an image'),
  }),
  responseSchema: z.object({ url: z.string() }),
})

function AvatarUpload({ userId }: { userId: string }) {
  const { mutate, error } = uploadAvatar()

  return (
    <div>
      {/* ... */}
      {error?.kind === 'request-validation' && (
        <ul>
          {error.issues.map((issue) => (
            <li key={issue.path?.join('.')}>{issue.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

## Updating the Cache After an Upload

```typescript
const uploadAvatar = client.mutation({
  method: 'POST',
  url: '/users/$userId/avatar',
  body: 'multipart',
  requestSchema: z.object({ file: z.instanceof(File) }),
  responseSchema: z.object({ url: z.string() }),
  onSuccess: (data, variables, context) => {
    getUser.setData(
      context.client,
      { urlParams: variables.urlParams },
      (user) => user && { ...user, avatarUrl: data.url },
    )
  },
})
```

## Server Errors

Declare an `errorSchema` to handle upload-specific statuses:

```typescript
const uploadAvatar = client.mutation({
  method: 'POST',
  url: '/users/$userId/avatar',
  body: 'multipart',
  requestSchema: z.object({ file: z.instanceof(File) }),
  responseSchema: z.object({ url: z.string() }),
  errorSchema: {
    413: z.object({ maxBytes: z.number() }),
  },
})

const { error } = uploadAvatar()

if (error?.kind === 'http' && error.status === 413) {
  error.body.maxBytes // number
}
```

## Next Steps

- [Mutations](/docs/builder/react-query/guides/mutations) - Mutation settings and callbacks
- [File Downloads](/docs/builder/react-query/advanced/file-downloads) - Blob, text and stream responses
- [Typed Errors](/docs/builder/react-query/advanced/error-schemas) - Every error kind
