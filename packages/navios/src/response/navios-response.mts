export interface NaviosResponse<T> {
  data: T
  status: number
  statusText: string
  headers: Headers
}

export type NaviosPromise<T = any> = Promise<NaviosResponse<T>>
