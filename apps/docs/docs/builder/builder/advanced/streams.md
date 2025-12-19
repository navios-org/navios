---
sidebar_position: 1
---

# Streams

Stream endpoints allow you to download binary data (files, images, PDFs, etc.) as `Blob` objects. Builder provides `declareStream` for handling file downloads.

## Basic Usage

Declare a stream endpoint:

```typescript
const downloadFile = API.declareStream({
  method: 'GET',
  url: '/files/$fileId/download',
})

// Usage
const blob = await downloadFile({ urlParams: { fileId: '123' } })
```

## Downloading Files

### Basic Download

```typescript
const downloadFile = API.declareStream({
  method: 'GET',
  url: '/files/$fileId/download',
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
const downloadFile = API.declareStream({
  method: 'GET',
  url: '/files/$fileId/download',
  querySchema: z.object({
    format: z.enum(['pdf', 'docx']).optional(),
    quality: z.enum(['low', 'high']).optional(),
  }),
})

// Usage
const blob = await downloadFile({
  urlParams: { fileId: '123' },
  params: { format: 'pdf', quality: 'high' },
})
```

### With Request Body

```typescript
const generateReport = API.declareStream({
  method: 'POST',
  url: '/reports/generate',
  requestSchema: z.object({
    type: z.enum(['pdf', 'excel']),
    dateRange: z.object({
      start: z.string().datetime(),
      end: z.string().datetime(),
    }),
  }),
})

// Usage
const blob = await generateReport({
  data: {
    type: 'pdf',
    dateRange: {
      start: '2024-01-01T00:00:00Z',
      end: '2024-12-31T23:59:59Z',
    },
  },
})
```

## Handling Different File Types

### Images

```typescript
const getImage = API.declareStream({
  method: 'GET',
  url: '/images/$imageId',
})

async function displayImage(imageId: string) {
  const blob = await getImage({ urlParams: { imageId } })
  const url = URL.createObjectURL(blob)

  // Use in img tag
  const img = document.createElement('img')
  img.src = url
  document.body.appendChild(img)
}
```

### PDFs

```typescript
const getPDF = API.declareStream({
  method: 'GET',
  url: '/documents/$docId/pdf',
})

async function viewPDF(docId: string) {
  const blob = await getPDF({ urlParams: { docId } })
  const url = URL.createObjectURL(blob)

  // Open in new window
  window.open(url, '_blank')
}
```

### CSV/Excel

```typescript
const exportData = API.declareStream({
  method: 'GET',
  url: '/data/export',
  querySchema: z.object({
    format: z.enum(['csv', 'xlsx']),
  }),
})

async function downloadExport(format: 'csv' | 'xlsx') {
  const blob = await exportData({ params: { format } })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `export.${format}`
  a.click()
  URL.revokeObjectURL(url)
}
```

## Error Handling

Stream endpoints throw errors just like regular endpoints:

```typescript
const downloadFile = API.declareStream({
  method: 'GET',
  url: '/files/$fileId/download',
})

try {
  const blob = await downloadFile({ urlParams: { fileId: '123' } })
  // Handle blob
} catch (error) {
  if (error instanceof NaviosError) {
    console.error('Download failed:', error.message)
  }
}
```

## Common Patterns

### File Download with Filename

```typescript
const downloadFile = API.declareStream({
  method: 'GET',
  url: '/files/$fileId/download',
})

async function downloadWithName(fileId: string, filename: string) {
  const blob = await downloadFile({ urlParams: { fileId } })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

### Preview Before Download

```typescript
const getFilePreview = API.declareStream({
  method: 'GET',
  url: '/files/$fileId/preview',
})

async function previewFile(fileId: string) {
  const blob = await getFilePreview({ urlParams: { fileId } })
  const url = URL.createObjectURL(blob)

  // Show preview
  const previewWindow = window.open(url, '_blank')

  // Download after preview
  setTimeout(() => {
    const a = document.createElement('a')
    a.href = url
    a.download = 'file.pdf'
    a.click()
  }, 2000)
}
```

### Multiple File Downloads

```typescript
const downloadFile = API.declareStream({
  method: 'GET',
  url: '/files/$fileId/download',
})

async function downloadMultiple(fileIds: string[]) {
  const downloads = fileIds.map((fileId) =>
    downloadFile({ urlParams: { fileId } }),
  )

  const blobs = await Promise.all(downloads)

  // Download each file
  blobs.forEach((blob, index) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `file-${fileIds[index]}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  })
}
```

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

### Handle Large Files

```typescript
const downloadLargeFile = API.declareStream({
  method: 'GET',
  url: '/files/$fileId/download',
})

async function downloadWithProgress(fileId: string) {
  try {
    // Show loading indicator
    showLoading('Downloading file...')

    const blob = await downloadLargeFile({ urlParams: { fileId } })

    // Hide loading indicator
    hideLoading()

    // Handle blob
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'file.pdf'
    a.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    hideLoading()
    showError('Download failed')
  }
}
```

### Validate File Types

```typescript
const downloadFile = API.declareStream({
  method: 'GET',
  url: '/files/$fileId/download',
  querySchema: z.object({
    type: z.enum(['pdf', 'docx', 'xlsx']),
  }),
})

// Usage
const blob = await downloadFile({
  urlParams: { fileId: '123' },
  params: { type: 'pdf' },
})

// Validate blob type
if (blob.type !== 'application/pdf') {
  throw new Error('Invalid file type')
}
```

## Next Steps

- [Multipart Uploads](/docs/builder/builder/advanced/multipart) - Upload files
- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - Review endpoint basics
- [Error Handling](/docs/builder/builder/guides/error-handling) - Handle stream errors
