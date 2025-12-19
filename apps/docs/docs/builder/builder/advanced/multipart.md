---
sidebar_position: 2
---

# Multipart Uploads

Multipart endpoints handle file uploads using `multipart/form-data` encoding. Builder automatically converts your request data to `FormData` and handles file serialization.

## Basic Usage

Declare a multipart endpoint:

```typescript
const uploadFile = API.declareMultipart({
  method: 'POST',
  url: '/files',
  requestSchema: z.object({
    file: z.instanceof(File),
    name: z.string(),
  }),
  responseSchema: z.object({
    id: z.string(),
    url: z.string(),
  }),
})

// Usage
const result = await uploadFile({
  data: {
    file: selectedFile,
    name: 'document.pdf',
  },
})
```

## Single File Upload

### Basic Upload

```typescript
const uploadAvatar = API.declareMultipart({
  method: 'POST',
  url: '/users/$userId/avatar',
  requestSchema: z.object({
    file: z.instanceof(File),
  }),
  responseSchema: z.object({
    url: z.string(),
  }),
})

// Usage
const fileInput = document.querySelector('input[type="file"]')
const file = fileInput.files[0]

const result = await uploadAvatar({
  urlParams: { userId: '123' },
  data: { file },
})

console.log('Avatar URL:', result.url)
```

### With Additional Fields

```typescript
const uploadDocument = API.declareMultipart({
  method: 'POST',
  url: '/documents',
  requestSchema: z.object({
    file: z.instanceof(File),
    title: z.string(),
    description: z.string().optional(),
    category: z.enum(['public', 'private']),
  }),
  responseSchema: z.object({
    id: z.string(),
    url: z.string(),
  }),
})

// Usage
const result = await uploadDocument({
  data: {
    file: selectedFile,
    title: 'My Document',
    description: 'Important document',
    category: 'private',
  },
})
```

## Multiple File Upload

### Array of Files

```typescript
const uploadFiles = API.declareMultipart({
  method: 'POST',
  url: '/files',
  requestSchema: z.object({
    files: z.array(z.instanceof(File)),
    folder: z.string().optional(),
  }),
  responseSchema: z.object({
    ids: z.array(z.string()),
  }),
})

// Usage
const fileInput = document.querySelector('input[type="file"]')
const files = Array.from(fileInput.files)

const result = await uploadFiles({
  data: {
    files,
    folder: 'uploads',
  },
})
```

### Named File Fields

```typescript
const uploadMultiple = API.declareMultipart({
  method: 'POST',
  url: '/upload',
  requestSchema: z.object({
    avatar: z.instanceof(File),
    cover: z.instanceof(File),
    document: z.instanceof(File).optional(),
  }),
  responseSchema: z.object({
    avatarUrl: z.string(),
    coverUrl: z.string(),
    documentUrl: z.string().optional(),
  }),
})

// Usage
const result = await uploadMultiple({
  data: {
    avatar: avatarFile,
    cover: coverFile,
    document: documentFile, // Optional
  },
})
```

## File Validation

### Size Validation

```typescript
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

const uploadFile = API.declareMultipart({
  method: 'POST',
  url: '/files',
  requestSchema: z.object({
    file: z.instanceof(File).refine(
      (file) => file.size <= MAX_FILE_SIZE,
      { message: 'File size must be less than 5MB' }
    ),
  }),
  responseSchema: z.object({
    id: z.string(),
  }),
})
```

### Type Validation

```typescript
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif']

const uploadImage = API.declareMultipart({
  method: 'POST',
  url: '/images',
  requestSchema: z.object({
    file: z.instanceof(File).refine(
      (file) => ALLOWED_TYPES.includes(file.type),
      { message: 'File must be an image (JPEG, PNG, or GIF)' }
    ),
  }),
  responseSchema: z.object({
    id: z.string(),
    url: z.string(),
  }),
})
```

### Combined Validation

```typescript
const uploadDocument = API.declareMultipart({
  method: 'POST',
  url: '/documents',
  requestSchema: z.object({
    file: z.instanceof(File)
      .refine((file) => file.size <= 10 * 1024 * 1024, {
        message: 'File must be less than 10MB',
      })
      .refine(
        (file) => file.type === 'application/pdf',
        { message: 'File must be a PDF' }
      ),
    title: z.string().min(1).max(100),
  }),
  responseSchema: z.object({
    id: z.string(),
  }),
})
```

## React Integration

### File Input Handler

```typescript
function FileUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
    }
  }
  
  const handleUpload = async () => {
    if (!file) return
    
    setUploading(true)
    try {
      const result = await uploadFile({
        data: { file },
      })
      console.log('Uploaded:', result)
    } catch (error) {
      console.error('Upload failed:', error)
    } finally {
      setUploading(false)
    }
  }
  
  return (
    <div>
      <input type="file" onChange={handleFileChange} />
      <button onClick={handleUpload} disabled={!file || uploading}>
        {uploading ? 'Uploading...' : 'Upload'}
      </button>
    </div>
  )
}
```

### Drag and Drop

```typescript
function DragDropUpload() {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    
    const file = e.dataTransfer.files[0]
    if (!file) return
    
    setUploading(true)
    try {
      const result = await uploadFile({
        data: { file },
      })
      console.log('Uploaded:', result)
    } catch (error) {
      console.error('Upload failed:', error)
    } finally {
      setUploading(false)
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
      {uploading ? 'Uploading...' : 'Drop file here'}
    </div>
  )
}
```

## Progress Tracking

While Builder doesn't provide built-in progress tracking, you can implement it with your HTTP client:

```typescript
// Using @navios/http with XMLHttpRequest for progress
import { create } from '@navios/http'

const client = create({
  baseURL: 'https://api.example.com',
  // Custom implementation with progress
})

// Or use axios which supports progress
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

## Error Handling

Multipart endpoints throw errors just like regular endpoints:

```typescript
const uploadFile = API.declareMultipart({
  method: 'POST',
  url: '/files',
  requestSchema: z.object({
    file: z.instanceof(File),
  }),
  responseSchema: z.object({
    id: z.string(),
  }),
})

try {
  const result = await uploadFile({
    data: { file: selectedFile },
  })
} catch (error) {
  if (error instanceof NaviosError) {
    console.error('Upload failed:', error.message)
  } else if (error instanceof ZodError) {
    console.error('Validation failed:', error.errors)
  }
}
```

## Common Patterns

### Image Upload with Preview

```typescript
const uploadImage = API.declareMultipart({
  method: 'POST',
  url: '/images',
  requestSchema: z.object({
    file: z.instanceof(File),
  }),
  responseSchema: z.object({
    url: z.string(),
  }),
})

function ImageUpload() {
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  
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
  
  const handleUpload = async () => {
    if (!file) return
    
    try {
      const result = await uploadImage({ data: { file } })
      console.log('Uploaded:', result.url)
    } catch (error) {
      console.error('Upload failed:', error)
    }
  }
  
  return (
    <div>
      <input type="file" accept="image/*" onChange={handleFileChange} />
      {preview && <img src={preview} alt="Preview" />}
      <button onClick={handleUpload} disabled={!file}>
        Upload
      </button>
    </div>
  )
}
```

### Multiple File Upload with Progress

```typescript
const uploadFiles = API.declareMultipart({
  method: 'POST',
  url: '/files',
  requestSchema: z.object({
    files: z.array(z.instanceof(File)),
  }),
  responseSchema: z.object({
    ids: z.array(z.string()),
  }),
})

async function uploadWithProgress(files: File[]) {
  const total = files.length
  let completed = 0
  
  for (const file of files) {
    try {
      await uploadFiles({ data: { files: [file] } })
      completed++
      console.log(`Progress: ${completed}/${total}`)
    } catch (error) {
      console.error(`Failed to upload ${file.name}:`, error)
    }
  }
}
```

## Best Practices

### Validate Before Upload

```typescript
// ✅ Good - validate before upload
function validateFile(file: File): string | null {
  if (file.size > 10 * 1024 * 1024) {
    return 'File must be less than 10MB'
  }
  if (!file.type.startsWith('image/')) {
    return 'File must be an image'
  }
  return null
}

const error = validateFile(selectedFile)
if (error) {
  showError(error)
  return
}

await uploadFile({ data: { file: selectedFile } })
```

### Show User Feedback

```typescript
// ✅ Good - show loading state
const [uploading, setUploading] = useState(false)

const handleUpload = async () => {
  setUploading(true)
  try {
    await uploadFile({ data: { file } })
    showSuccess('File uploaded successfully')
  } catch (error) {
    showError('Upload failed')
  } finally {
    setUploading(false)
  }
}
```

### Handle Large Files

```typescript
// ✅ Good - warn about large files
const MAX_SIZE = 100 * 1024 * 1024 // 100MB

if (file.size > MAX_SIZE) {
  const proceed = confirm(
    `File is large (${(file.size / 1024 / 1024).toFixed(2)}MB). Continue?`
  )
  if (!proceed) return
}

await uploadFile({ data: { file } })
```

## Next Steps

- [Streams](/docs/builder/builder/advanced/streams) - Download files
- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - Review endpoint basics
- [Error Handling](/docs/builder/builder/guides/error-handling) - Handle upload errors

