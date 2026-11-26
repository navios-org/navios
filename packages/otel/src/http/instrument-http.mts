import { httpTransport } from '@navios/server'

import type { PluginApi } from '@navios/core'

import { OtelHttpInterceptor } from './otel-http-interceptor.mjs'

/**
 * Adds the HTTP request span to the routes of an application when `enabled`,
 * and tells whether the application serves HTTP.
 */
export function instrumentHttp(api: PluginApi, enabled: boolean): boolean {
  const http = api.transport(httpTransport)
  if (http !== undefined && enabled) {
    http.intercept(OtelHttpInterceptor)
  }
  return http !== undefined
}
