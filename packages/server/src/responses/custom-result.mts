const customResultBrand: unique symbol = Symbol.for('navios.core.CustomResult')

/**
 * A handler's answer of a custom response kind, created with `result()`. A
 * response encoder registered for that kind turns it into something an
 * adapter can write.
 */
export interface CustomResult<Kind extends string = string, Body = unknown> {
  readonly [customResultBrand]: true
  readonly kind: Kind
  readonly body: Body
  readonly status: number
  readonly headers: Record<string, string> | undefined
}

/**
 * Answers a `response: 'text' | 'stream' | 'blob'` endpoint with a value of
 * a custom kind, for which a plugin has registered an encoder with
 * `api.encoder(kind, encoder)`. Packages wrap this in their own helper, for
 * example `xml(<Feed />)`.
 */
export function result<const Kind extends string, Body>(
  kind: Kind,
  body: Body,
  options: { status?: number; headers?: Record<string, string> } = {},
): CustomResult<Kind, Body> {
  return {
    [customResultBrand]: true,
    kind,
    body,
    status: options.status ?? 200,
    headers: options.headers,
  }
}

export function isCustomResult(value: unknown): value is CustomResult {
  return typeof value === 'object' && value !== null && customResultBrand in value
}
