export interface NaviosResponse<T> {
  data: T
  status: number
  statusText: string
  headers: Headers
}
