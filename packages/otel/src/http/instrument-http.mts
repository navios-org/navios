import { httpTransport } from '@navios/server'

import type { PluginApi } from '@navios/core'

import { OtelHttpInterceptor } from './otel-http-interceptor.mjs'

/** Whether the application serves HTTP. */
export function hasHttpTransport(api: PluginApi): boolean {
  return api.transport(httpTransport) !== undefined
}

/**
 * Adds the HTTP request span to an application's routes. Returns `false`
 * when the application has no HTTP transport, and so no routes to trace.
 *
 * `otelPlugin` calls this by itself when `autoInstrument.http` is on.
 */
export function instrumentHttp(api: PluginApi): boolean {
  const http = api.transport(httpTransport)
  if (!http) {
    return false
  }
  http.intercept(OtelHttpInterceptor)
  return true
}
