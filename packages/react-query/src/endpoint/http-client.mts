import type { Client } from '@navios/builder'
import type { QueryClient } from '@tanstack/react-query'

const clients = new WeakMap<QueryClient, Client>()

/**
 * Binds an HTTP client to a `QueryClient`. Every query and mutation that
 * runs through that `QueryClient` then uses this HTTP client instead of the
 * builder's shared one.
 *
 * This is the per-request tool for SSR: a server creates one `QueryClient`
 * per request, so binding the request's HTTP client (with its cookies and
 * auth) to it keeps requests isolated without touching global state.
 *
 * @example
 * ```ts
 * // In a server loader
 * const queryClient = new QueryClient()
 * setHttpClient(queryClient, createHttpClientFor(request))
 *
 * await getUser.prefetch(queryClient, { urlParams: { userId } })
 * ```
 */
export function setHttpClient(queryClient: QueryClient, client: Client | null): void {
  if (client) {
    clients.set(queryClient, client)
  } else {
    clients.delete(queryClient)
  }
}

/** Returns the HTTP client bound to a `QueryClient`, if any. */
export function getHttpClient(queryClient: QueryClient): Client | undefined {
  return clients.get(queryClient)
}

/** @internal Per-call endpoint options for a request made through `queryClient`. */
export function callOptionsFor(queryClient: QueryClient): { client: Client } | undefined {
  const client = clients.get(queryClient)
  return client ? { client } : undefined
}
