import { InjectionToken, registerInjectable } from '@navios/di'

import type { RouteResult } from '../routing/route-result.mjs'

import { problem } from './problem.mjs'
import { formatPath, ValidationError } from './validation-error.mjs'

/**
 * Produces the response for one kind of framework error. Replace a default
 * with `provide(NotFoundResponderToken, MyResponder)`.
 */
export interface ErrorResponder {
  getResponse(error: unknown, description?: string): RouteResult
}

export const NotFoundResponderToken = InjectionToken.create<ErrorResponder>('NotFoundResponder')
export const ForbiddenResponderToken = InjectionToken.create<ErrorResponder>('ForbiddenResponder')
export const ValidationErrorResponderToken = InjectionToken.create<ErrorResponder>(
  'ValidationErrorResponder',
)
export const InternalServerErrorResponderToken = InjectionToken.create<ErrorResponder>(
  'InternalServerErrorResponder',
)

export class NotFoundResponder implements ErrorResponder {
  getResponse(_error: unknown, description?: string): RouteResult {
    return problem(404, description ?? 'The requested resource was not found')
  }
}
registerInjectable(NotFoundResponder, { token: NotFoundResponderToken })

export class ForbiddenResponder implements ErrorResponder {
  getResponse(_error: unknown, description?: string): RouteResult {
    return problem(403, description ?? 'Access to this resource is forbidden')
  }
}
registerInjectable(ForbiddenResponder, { token: ForbiddenResponderToken })

export class ValidationErrorResponder implements ErrorResponder {
  getResponse(error: unknown, description?: string): RouteResult {
    if (error instanceof ValidationError) {
      return problem(400, description ?? `Request validation failed for ${error.source}`, {
        source: error.source,
        errors: error.issues.map((issue) => ({
          path: formatPath(issue.path),
          message: issue.message,
        })),
      })
    }
    return problem(400, description ?? 'Request validation failed')
  }
}
registerInjectable(ValidationErrorResponder, { token: ValidationErrorResponderToken })

export class InternalServerErrorResponder implements ErrorResponder {
  getResponse(_error: unknown, description?: string): RouteResult {
    return problem(500, description ?? 'An unexpected error occurred')
  }
}
registerInjectable(InternalServerErrorResponder, { token: InternalServerErrorResponderToken })
