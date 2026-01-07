import { InjectableScope } from '@navios/core'
import { Injectable } from '@navios/core/legacy-compat'

@Injectable({ scope: InjectableScope.Request })
export class PostsValidationService {
  private readonly validationId: string = Math.random().toString(36).substring(7)
  private validatedAt: string | null = null

  getValidationId(): string {
    return this.validationId
  }

  validate(title: string, content: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    if (title.length < 3) {
      errors.push('Title must be at least 3 characters')
    }

    if (content.length < 10) {
      errors.push('Content must be at least 10 characters')
    }

    this.validatedAt = new Date().toISOString()

    return { isValid: errors.length === 0, errors }
  }

  getValidatedAt(): string | null {
    return this.validatedAt
  }
}
