---
sidebar_position: 5
---

# Multipart Mutations

Multipart mutations handle file uploads using `multipart/form-data` encoding. Builder automatically converts your request data to `FormData`.

## Basic Multipart Mutation

```typescript
const uploadFile = client.multipartMutation({
  method: 'POST',
  url: '/files',
  requestSchema: z.object({
    file: z.instanceof(File),
    description: z.string().optional(),
  }),
  responseSchema: z.object({
    fileId: z.string(),
    url: z.string(),
  }),
  processResponse: (data) => data,
})
```

## Usage

```typescript
function FileUpload() {
  const { mutate, isPending, data } = uploadFile()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      mutate({
        data: {
          file,
          description: 'Profile photo',
        },
      })
    }
  }

  return (
    <div>
      <input type="file" onChange={handleFileChange} />
      {isPending && <div>Uploading...</div>}
      {data && <div>Uploaded: {data.url}</div>}
    </div>
  )
}
```

## With URL Parameters

```typescript
const uploadAvatar = client.multipartMutation({
  method: 'POST',
  url: '/users/$userId/avatar',
  requestSchema: z.object({
    file: z.instanceof(File),
  }),
  responseSchema: z.object({
    url: z.string(),
  }),
  processResponse: (data) => data,
})

// Usage
function AvatarUpload({ userId }: { userId: string }) {
  const { mutate, isPending } = uploadAvatar()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      mutate({
        urlParams: { userId },
        data: { file },
      })
    }
  }

  return <input type="file" onChange={handleFileChange} />
}
```

## Multiple Files

```typescript
const uploadFiles = client.multipartMutation({
  method: 'POST',
  url: '/files',
  requestSchema: z.object({
    files: z.array(z.instanceof(File)),
    folder: z.string().optional(),
  }),
  responseSchema: z.object({
    ids: z.array(z.string()),
  }),
  processResponse: (data) => data,
})

// Usage
function MultiFileUpload() {
  const { mutate, isPending } = uploadFiles()

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      mutate({
        data: {
          files,
          folder: 'uploads',
        },
      })
    }
  }

  return (
    <input
      type="file"
      multiple
      onChange={handleFilesChange}
    />
  )
}
```

## File Validation

Validate files before upload:

```typescript
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

const uploadImage = client.multipartMutation({
  method: 'POST',
  url: '/images',
  requestSchema: z.object({
    file: z.instanceof(File).refine(
      (file) => file.size <= MAX_FILE_SIZE,
      { message: 'File must be less than 5MB' }
    ).refine(
      (file) => file.type.startsWith('image/'),
      { message: 'File must be an image' }
    ),
  }),
  responseSchema: z.object({
    url: z.string(),
  }),
  processResponse: (data) => data,
})
```

## Progress Tracking

While Builder doesn't provide built-in progress tracking, you can implement it with your HTTP client:

```typescript
// Using axios with progress
import axios from 'axios'

const client = axios.create({
  baseURL: 'https://api.example.com',
  onUploadProgress: (progressEvent) => {
    const percentCompleted = Math.round(
      (progressEvent.loaded * 100) / progressEvent.total
    )
    console.log(`Upload progress: ${percentCompleted}%`)
  },
})

API.provideClient(client)
```

## Common Patterns

### Image Upload with Preview

```typescript
function ImageUpload() {
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const { mutate, isPending } = uploadImage()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)

      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result as string)
      }
      reader.readAsDataURL(selectedFile)
    }
  }

  const handleUpload = () => {
    if (file) {
      mutate({ data: { file } })
    }
  }

  return (
    <div>
      <input type="file" accept="image/*" onChange={handleFileChange} />
      {preview && <img src={preview} alt="Preview" />}
      <button onClick={handleUpload} disabled={!file || isPending}>
        {isPending ? 'Uploading...' : 'Upload'}
      </button>
    </div>
  )
}
```

### Drag and Drop

```typescript
function DragDropUpload() {
  const [dragging, setDragging] = useState(false)
  const { mutate, isPending } = uploadFile()

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      mutate({ data: { file } })
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      style={{
        border: dragging ? '2px dashed blue' : '2px dashed gray',
        padding: '20px',
      }}
    >
      {isPending ? 'Uploading...' : 'Drop file here'}
    </div>
  )
}
```

### With Success Callback

```typescript
const uploadFile = client.multipartMutation({
  method: 'POST',
  url: '/files',
  requestSchema: z.object({
    file: z.instanceof(File),
  }),
  responseSchema: z.object({
    url: z.string(),
  }),
  processResponse: (data) => data,
  onSuccess: (data) => {
    console.log('File uploaded:', data.url)
    // Show success message, update UI, etc.
  },
})
```

## Error Handling

```typescript
function FileUpload() {
  const { mutate, isPending, isError, error } = uploadFile()

  const handleUpload = (file: File) => {
    mutate({ data: { file } })
  }

  return (
    <div>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleUpload(file)
        }}
      />
      {isPending && <div>Uploading...</div>}
      {isError && (
        <div className="error">
          {error instanceof NaviosError
            ? error.message
            : 'Upload failed'}
        </div>
      )}
    </div>
  )
}
```

## Next Steps

- [Mutations](/docs/builder/react-query/guides/mutations) - Basic mutations
- [Streams](/docs/builder/react-query/advanced/streams) - Download files
- [Error Handling](/docs/builder/react-query/guides/mutations#error-handling) - Handle upload errors

