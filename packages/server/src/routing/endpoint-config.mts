/**
 * The parts of a builder declaration the server reads. Schemas are Standard
 * Schemas; the builder's own `Schema` type is structurally the same.
 */
export interface RouteEndpointConfig {
  method: string
  url: string
  querySchema?: SchemaLike
  requestSchema?: SchemaLike
  urlParamsSchema?: SchemaLike
  headersSchema?: SchemaLike
  cookiesSchema?: SchemaLike
  responseSchema?: SchemaLike
  responses?: Record<number, SchemaLike | null>
  errorSchema?: Record<number, SchemaLike>
  body?: 'json' | 'multipart'
  response?: 'json' | 'blob' | 'text' | 'stream' | 'void'
}

export type SchemaLike = import('@navios/core').StandardSchemaV1<any, any>
