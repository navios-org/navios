export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

/** Methods whose `data` is never sent: `fetch` rejects a GET or HEAD with a body. */
export const METHODS_WITHOUT_BODY: readonly HttpMethod[] = ['GET', 'HEAD']
