---
sidebar_position: 1
---

# Form Handling

This recipe demonstrates how to handle forms with dependency injection in React.

## Basic Form with Service

```tsx
import { useService, useInvalidate } from '@navios/di-react'
import { Injectable } from '@navios/di'

@Injectable()
class FormService {
  async submitForm(data: any) {
    // Form submission logic
    return { success: true, id: Math.random().toString(36) }
  }
}

function ContactForm() {
  const { data: formService } = useService(FormService)
  const invalidateForm = useInvalidate(FormService)
  const [formData, setFormData] = useState({ name: '', email: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const result = await formService?.submitForm(formData)
      if (result?.success) {
        invalidateForm() // Refresh form service
        setFormData({ name: '', email: '' }) // Reset form
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
      />
      <input
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
      />
      <button type="submit" disabled={isSubmitting}>
        Submit
      </button>
    </form>
  )
}
```

