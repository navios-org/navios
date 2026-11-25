import type { RouteResult } from '../routing/route-result.mjs'

import { statusTitle } from './status-title.mjs'

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
