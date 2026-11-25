export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

/** Methods whose `data` is never sent: `fetch` rejects a GET or HEAD with a body. */
export const RequestsWithoutBody = ['GET', 'HEAD'] as const
export type RequestsWithoutBody = (typeof RequestsWithoutBody)[number]
export type RequestsWithBody = Exclude<HttpMethod, RequestsWithoutBody>
export const RequestsWithBody = ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const
