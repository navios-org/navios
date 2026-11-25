export interface NaviosResponse<T> {
  data: T
  status: number
  statusText: string
  headers: Headers
}

export type NaviosPromise<T = unknown> = Promise<NaviosResponse<T>>
