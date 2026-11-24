import { InjectionToken, registerInjectable } from '@navios/di'

import { formatPath, ValidationError } from '../routing/validation.mjs'

import type { RouteResult } from '../routing/types.mjs'

import { statusTitle } from './http-exception.mjs'

/**
 * RFC 9457 problem details.
 */
export interface ProblemDetails {
  type?: string
  title: string
  status: number
  detail?: string
  [key: string]: unknown
}

export const PROBLEM_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/problem+json',
})

export function problem(
  status: number,
  detail?: string,
  extra?: Record<string, unknown>,
): RouteResult {
  const body: ProblemDetails = {
    type: 'about:blank',
    title: statusTitle(status),
    status,
    ...(detail === undefined ? null : { detail }),
    ...extra,
  }
  return { status, headers: { ...PROBLEM_HEADERS }, body, kind: 'json' }
}

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
