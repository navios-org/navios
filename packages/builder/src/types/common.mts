export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'HEAD'
  | 'OPTIONS'

export interface AbstractResponse<T> {
  data: T
  status: number
  statusText: string
  headers: Record<string, string> | Headers
}

export interface AbstractRequestConfig {
  params?: Record<string, unknown> | URLSearchParams
  method?: HttpMethod
  url: string
  data?: any
  headers?: Record<string, string>
  signal?: AbortSignal | null
  [key: string]: any
}

export interface Client {
  request: <T = unknown>(
    config: AbstractRequestConfig,
  ) => Promise<AbstractResponse<T>>
}
