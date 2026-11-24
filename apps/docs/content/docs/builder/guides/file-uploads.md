---
title: File uploads
---

# File uploads

To send files, declare the endpoint with `body: 'multipart'`. You still pass a plain object as `data`; Builder validates it and converts it to `FormData`.

## Declaring an upload

```ts
export const uploadAvatar = API.declareEndpoint({
  method: 'POST',
  url: '/users/$userId/avatar',
  body: 'multipart',
  requestSchema: z.object({
    file: z.instanceof(File),
    caption: z.string().optional(),
  }),
  responseSchema: z.object({ url: z.string() }),
})

await uploadAvatar({
  urlParams: { userId: '42' },
  data: { file, caption: 'Profile picture' },
})
```

Everything else about the endpoint works as usual: URL and query parameters, `errorSchema`, `.safe()`, and a JSON response validated by `responseSchema`.

## How values become form fields

Each key of the validated object becomes one or more fields:

| Value                          | Sent as                                           |
| ------------------------------ | ------------------------------------------------- |
| `File`                         | a file part, with its name                        |
| `Blob`                         | a binary part                                     |
| array                          | one field per item, all under the same key        |
| `Date`                         | an ISO string                                     |
| string, number, boolean, bigint | its string form                                  |
| other object                   | JSON                                              |
| `null`                         | an empty string                                   |
| `undefined`                    | left out                                          |

So several files under one key are an array:

```ts
export const uploadAttachments = API.declareEndpoint({
  method: 'POST',
  url: '/posts/$postId/attachments',
  body: 'multipart',
  requestSchema: z.object({
    files: z.array(z.instanceof(File)).min(1).max(10),
    tags: z.array(z.string()).optional(),
  }),
  responseSchema: z.object({ ids: z.array(z.string()) }),
})
```

If you already have a `FormData` instance, pass it as `data` and it is sent unchanged. The `requestSchema` then has to accept a `FormData` value, for example `z.instanceof(FormData)`.

## Validating files before they are sent

Because the schema runs before the request, size and type limits in it stop a bad upload without using the network. The call fails with kind `request-validation`.

```ts
const imageSchema = z
  .instanceof(File)
  .refine((file) => file.size <= 5 * 1024 * 1024, 'File must be 5 MB or smaller')
  .refine((file) => file.type.startsWith('image/'), 'File must be an image')
```

```ts
const res = await uploadAvatar.safe({ urlParams: { userId: '42' }, data: { file } })

if (!res.ok && res.error.kind === 'request-validation') {
  showError(res.error.issues[0]?.message)
}
```

Client-side checks are a convenience for the user. The server must enforce the same limits.

## Client requirements

Your HTTP client must send a `FormData` body as it is and let the runtime set the `Content-Type` header with its boundary. `@navios/http` and axios both do. If you wrote your own `fetch` wrapper, make sure it does not `JSON.stringify` a `FormData` body or force a JSON content type.

For file inputs and upload state in React, see [Uploads and downloads](/docs/builder/react-query/uploads-and-downloads) in the React Query docs. Receiving the upload on a Navios server is covered in the server's [File uploads](/docs/server/guides/file-uploads) guide.
