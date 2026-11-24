import { callErrorHook } from '../errors/call-error-hook.mjs'
import { EndpointError } from '../errors/endpoint-error.mjs'
import { NaviosError } from '../errors/navios-error.mjs'
import { bindUrlParams, getUrlParamNames } from '../request/bind-url-params.mjs'
import { makeConfig } from '../request/make-config.mjs'
import { validate } from '../request/validate.mjs'

import type { EndpointErrorInit } from '../errors/endpoint-error.mjs'
import type { AbstractRequestConfig, AbstractResponse, Client } from '../types/common.mjs'
import type { BaseEndpointOptions, BuilderContext } from '../types/config.mjs'
import type { ResponseMeta, SafeResult } from '../types/result.mjs'
import type { Schema } from '../types/schema.mjs'

/**
 * Loosely-typed call arguments, as the runtime sees them.
 */
export interface HandlerRequest {
  urlParams?: Record<string, unknown>
  params?: Record<string, unknown>
  data?: unknown
  signal?: AbortSignal | null
  headers?: Record<string, string>
  timeout?: number
}

/** Loosely-typed per-call options, as the runtime sees them. */
export interface HandlerCallOptions {
  client?: Client
}

type ResponseLike = Pick<AbstractResponse<unknown>, 'status' | 'statusText' | 'headers'>

/**
 * Normalizes response metadata into the canonical {@link ResponseMeta}
 * shape. Plain-object header bags are upgraded to a `Headers` instance.
 */
export function toResponseMeta(r: ResponseLike): ResponseMeta {
  return { status: r.status, statusText: r.statusText ?? '', headers: toHeaders(r.headers) }
}

/**
 * Builds a `Headers` instance from whatever header bag a client reports.
 *
 * `new Headers(bag)` throws on a name or value the Fetch spec rejects and
 * joins array values into one string. Headers are metadata, so a bad entry
 * must not turn a finished request into a failure: entries are appended one
 * by one, array values (axios reports `set-cookie` this way) once per item,
 * and anything `Headers` refuses is skipped.
 */
function toHeaders(source: unknown): Headers {
  if (source instanceof Headers) return source
  const headers = new Headers()
  if (typeof source !== 'object' || source === null) return headers
  for (const [name, value] of Object.entries(source)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined || item === null) continue
      try {
        headers.append(name, String(item))
      } catch {
        // Not representable as a header; leave it out.
      }
    }
  }
  return headers
}

function getResponse(error: unknown): AbstractResponse<unknown> | null {
  if (typeof error !== 'object' || error === null) return null
  if (!('response' in error) || !error.response) return null
  const response = error.response as AbstractResponse<unknown>
  return typeof response.status === 'number' ? response : null
}

function errorName(value: unknown): string | undefined {
  return typeof value === 'object' && value !== null && 'name' in value
    ? String(value.name)
    : undefined
}

function errorCode(value: unknown): string | undefined {
  return typeof value === 'object' && value !== null && 'code' in value
    ? String(value.code)
    : undefined
}

/**
 * Classifies a rejection that carries no HTTP response.
 *
 * Timeouts are checked first because `AbortSignal.timeout()` also leaves the
 * signal in the aborted state.
 */
export function classifyTransportFailure(
  error: unknown,
  signal: AbortSignal | null | undefined,
): 'timeout' | 'aborted' | 'network' {
  const name = errorName(error)
  const code = errorCode(error)
  if (
    name === 'TimeoutError' ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    (signal?.aborted && errorName(signal.reason) === 'TimeoutError')
  ) {
    return 'timeout'
  }
  if (name === 'AbortError' || code === 'ERR_CANCELED' || signal?.aborted) {
    return 'aborted'
  }
  return 'network'
}

function isSuccessStatus(status: unknown): boolean {
  // A client that reports no numeric status is trusted: it resolved, so it succeeded.
  return typeof status !== 'number' || (status >= 200 && status < 300)
}

/**
 * Checks, once, that an endpoint's declaration is internally consistent.
 *
 * @throws {NaviosError} when `urlParamsSchema` keys differ from the URL's
 *   `$param` names.
 */
export function assertValidDeclaration(options: BaseEndpointOptions): void {
  const { urlParamsSchema, url, method } = options
  if (!urlParamsSchema) return

  const urlNames = getUrlParamNames(url)
  // Only schemas that expose their keys (Zod objects) can be checked.
  const shape = (urlParamsSchema as { shape?: unknown }).shape
  if (typeof shape !== 'object' || shape === null) return
  const schemaNames = Object.keys(shape)
  const missing = urlNames.filter((name) => !schemaNames.includes(name))
  const extra = schemaNames.filter((name) => !urlNames.includes(name))

  if (missing.length > 0 || extra.length > 0) {
    const parts = [
      missing.length > 0 ? `missing in schema: ${missing.join(', ')}` : null,
      extra.length > 0 ? `not in URL: ${extra.join(', ')}` : null,
    ].filter(Boolean)
    throw new NaviosError(
      `[Navios-API]: urlParamsSchema of ${method} ${url} does not match its URL parameters (${parts.join('; ')})`,
    )
  }
}

/**
 * Creates the handler for one endpoint: a throwing function with a
 * non-throwing `safe` twin and the declaration attached as `config`.
 *
 * Both call styles run the same pipeline and produce the same
 * {@link EndpointError} for a given failure; they differ only in whether it is
 * thrown or returned.
 */
export function createHandler<Options extends BaseEndpointOptions>(
  options: Options,
  context: BuilderContext,
) {
  assertValidDeclaration(options)

  const { method, url, errorSchema } = options
  const endpoint = { method, url }
  const responseKind = options.response ?? 'json'
  const shouldValidate = options.validateResponse !== false
  const { responses } = options
  // The request is validated here, so the config helpers get options without
  // the request schemas and never validate a second time.
  const configOptions = { ...options, querySchema: undefined, requestSchema: undefined }

  function fail(init: Omit<EndpointErrorInit, 'endpoint'>): SafeResult<never, EndpointError> {
    const error = new EndpointError({ ...init, endpoint })
    callErrorHook(context.config.onError, error, 'Navios-API')
    return { ok: false, data: null, error, response: error.response }
  }

  async function failHttp(response: AbstractResponse<unknown>, cause: unknown) {
    const meta = toResponseMeta(response)
    const status = response.status
    const schema = errorSchema?.[status]

    if (!schema) {
      return fail({ kind: 'http-unknown', status, body: response.data, response: meta, cause })
    }

    const parsed = await validate(schema, response.data)
    if (parsed.ok) {
      return fail({ kind: 'http', status, body: parsed.value, response: meta, cause })
    }
    return fail({
      kind: 'response-validation',
      status,
      body: response.data,
      issues: parsed.issues,
      response: meta,
      cause: parsed.cause,
    })
  }

  /** Validates one part of the input; `undefined` schema passes it through. */
  async function validateInput(schema: Schema | undefined, value: unknown) {
    return schema ? validate(schema, value) : ({ ok: true, value } as const)
  }

  /**
   * Validates the request body. `data` may be left out when its schema has no
   * required fields (the call signature makes it optional in that case), so
   * an omitted body is also tried as an empty object before it is rejected.
   */
  async function validateBody(data: unknown) {
    const outcome = await validateInput(options.requestSchema, data)
    if (outcome.ok || data !== undefined || !options.requestSchema) return outcome
    const asEmpty = await validate(options.requestSchema, {})
    return asEmpty.ok ? asEmpty : outcome
  }

  /** Picks the schema for a successful response, or reports why there is none. */
  function successSchema(status: number): { schema: Schema | null } | { unexpected: true } {
    if (!responses) return { schema: options.responseSchema ?? null }
    return status in responses ? { schema: responses[status] ?? null } : { unexpected: true }
  }

  /**
   * The `safe()` contract is that the promise never rejects. The pipeline
   * below reports every failure it knows about; this wrapper turns anything
   * it did not anticipate (a client resolving with nonsense, a getter that
   * throws) into a failed result as well.
   */
  async function run(
    request?: HandlerRequest | null,
    callOptions?: HandlerCallOptions | null,
  ): Promise<SafeResult<unknown, EndpointError>> {
    try {
      return await execute(request ?? {}, callOptions ?? {})
    } catch (cause) {
      return fail({
        kind: 'network',
        message: `${method} ${url} failed: ${cause instanceof Error ? cause.message : 'unexpected error'}`,
        cause,
      })
    }
  }

  async function execute(
    request: HandlerRequest,
    callOptions: HandlerCallOptions,
  ): Promise<SafeResult<unknown, EndpointError>> {
    // 1. Resolve the client.
    let client: Client
    try {
      client = callOptions.client ?? context.getClient()
    } catch (cause) {
      return fail({
        kind: 'config',
        message: cause instanceof Error ? cause.message : undefined,
        cause,
      })
    }

    // 2. Validate input and build the request. Nothing is sent on failure.
    const urlParams = await validateInput(options.urlParamsSchema, request.urlParams)
    const params = await validateInput(options.querySchema, request.params ?? {})
    const data = await validateBody(request.data)
    const invalid = [urlParams, params, data].find((part) => !part.ok)
    if (invalid && !invalid.ok) {
      return fail({ kind: 'request-validation', issues: invalid.issues, cause: invalid.cause })
    }

    let config: AbstractRequestConfig
    try {
      const validated = {
        ...request,
        urlParams: (urlParams as { value: unknown }).value as Record<string, unknown>,
        params: (params as { value: unknown }).value as Record<string, unknown>,
        data: (data as { value: unknown }).value,
      }
      const finalUrl = bindUrlParams(url, validated)
      config = makeConfig(validated, configOptions, finalUrl)
    } catch (cause) {
      return fail({
        kind: 'config',
        message: cause instanceof Error ? `${method} ${url}: ${cause.message}` : undefined,
        cause,
      })
    }

    // 3. Send it.
    let response: AbstractResponse<unknown>
    try {
      response = await client.request(config)
    } catch (cause) {
      const errorResponse = getResponse(cause)
      if (errorResponse) {
        return failHttp(errorResponse, cause)
      }
      return fail({ kind: classifyTransportFailure(cause, request.signal), cause })
    }

    if (typeof response !== 'object' || response === null) {
      return fail({
        kind: 'network',
        message: `${method} ${url} failed: the HTTP client resolved without a response`,
        cause: response,
      })
    }

    // 4. The builder, not the client, decides what counts as success.
    if (!isSuccessStatus(response.status)) {
      return failHttp(response, undefined)
    }

    // 5. Shape the body.
    const meta = toResponseMeta(response)
    if (responseKind === 'void') {
      return { ok: true, data: undefined, error: null, response: meta }
    }
    if (responseKind !== 'json') {
      return { ok: true, data: response.data, error: null, response: meta }
    }

    const success = successSchema(response.status)
    if ('unexpected' in success) {
      return fail({
        kind: 'response-validation',
        status: response.status,
        body: response.data,
        issues: [{ message: `Status ${response.status} is not declared in \`responses\`` }],
        response: meta,
      })
    }
    if (responses && success.schema === null) {
      return { ok: true, data: undefined, error: null, response: meta }
    }
    if (!success.schema || !shouldValidate) {
      return { ok: true, data: response.data, error: null, response: meta }
    }

    const parsed = await validate(success.schema, response.data)
    if (parsed.ok) {
      return { ok: true, data: parsed.value, error: null, response: meta }
    }
    return fail({
      kind: 'response-validation',
      status: response.status,
      body: response.data,
      issues: parsed.issues,
      response: meta,
      cause: parsed.cause,
    })
  }

  const handler = async (request?: HandlerRequest, callOptions?: HandlerCallOptions) => {
    const result = await run(request, callOptions)
    if (!result.ok) {
      throw result.error
    }
    return result.data
  }

  handler.safe = run
  handler.config = options

  return handler
}
