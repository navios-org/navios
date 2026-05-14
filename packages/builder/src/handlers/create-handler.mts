import { ZodError } from 'zod/v4'

import type { ZodObject, ZodType } from 'zod/v4'

import { buildErrorEvent } from '../errors/build-error-event.mjs'
import { classifyError } from '../errors/classify-error.mjs'
import { handleError } from '../errors/handle-error.mjs'
import { bindUrlParams } from '../request/bind-url-params.mjs'
import { makeConfig } from '../request/make-config.mjs'

import type { AbstractRequestConfig, AbstractResponse, Client } from '../types/common.mjs'
import type { EnvelopeError } from '../types/envelope-error.mjs'
import type { ResponseEnvelopeErr, ResponseEnvelopeOk, ResponseMeta } from '../types/envelope.mjs'
import type { ErrorSchemaRecord } from '../types/error-schema.mjs'
import type { BaseEndpointOptions, BuilderContext } from '../types/index.mjs'

/**
 * Base request type for handler functions.
 * Includes urlParams, params (query), data (body), and request options.
 */
export interface HandlerRequest {
  urlParams?: Record<string, string | number>
  params?: Record<string, unknown>
  data?: unknown
  signal?: AbortSignal | null
  headers?: Record<string, string>
  [key: string]: unknown
}

export interface CreateHandlerOptions<Options extends BaseEndpointOptions> {
  options: Options
  context: BuilderContext
  isMultipart?: boolean
  responseSchema?: ZodType
  errorSchema?: ErrorSchemaRecord
  /** Optional Zod schema for validating URL parameters at runtime */
  urlParamsSchema?: ZodObject
  transformRequest?: (request: HandlerRequest) => HandlerRequest
  transformResponse?: (data: unknown) => unknown
}

// =============================================================================
// Composers (exported for direct testing and reuse)
// =============================================================================

/**
 * Result of {@link runRequest}: a discriminated union of either a successful
 * response or an unknown thrown value.
 */
export type RunResult =
  | { ok: true; response: AbstractResponse<unknown> }
  | { ok: false; error: unknown }

/**
 * Execute a single HTTP request against the client and convert the
 * resolve/reject outcome into a discriminated {@link RunResult}.
 */
export async function runRequest(
  client: Client,
  config: AbstractRequestConfig,
): Promise<RunResult> {
  try {
    const response = await client.request(config)
    return { ok: true, response }
  } catch (error) {
    return { ok: false, error }
  }
}

/**
 * Normalize the response-meta carried on a successful (or error-with-response)
 * HTTP outcome into the canonical {@link ResponseMeta} shape. Plain-object
 * header bags are upgraded to a `Headers` instance; an existing `Headers` is
 * passed through.
 */
export function toResponseMeta(r: {
  status: number
  statusText: string
  headers: Headers | Record<string, string>
}): ResponseMeta {
  const headers = r.headers instanceof Headers ? r.headers : new Headers(r.headers)
  return { status: r.status, statusText: r.statusText, headers }
}

/**
 * Construct a success envelope from already-parsed data plus the raw response.
 */
export function buildOk<TData>(
  data: TData,
  response: { status: number; statusText: string; headers: Headers | Record<string, string> },
): ResponseEnvelopeOk<TData> {
  return { ok: true, data, error: null, response: toResponseMeta(response) }
}

/**
 * Construct an error envelope by classifying an unknown thrown value into an
 * {@link EnvelopeError} variant. If the thrown value carries an HTTP
 * `response`, that response is normalized and preserved on the envelope;
 * otherwise `response` is `null` (network variant).
 */
export function buildErr(
  error: unknown,
  errorSchema: ErrorSchemaRecord | undefined,
): ResponseEnvelopeErr<EnvelopeError<ErrorSchemaRecord>> {
  const envError = classifyError(error, errorSchema) as EnvelopeError<ErrorSchemaRecord>
  const resp = (
    error as {
      response?: { status: number; statusText: string; headers: Headers | Record<string, string> }
    }
  ).response
  return {
    ok: false,
    data: null,
    error: envError,
    response: resp ? toResponseMeta(resp) : null,
  }
}

// =============================================================================
// Mode-specific composers (private)
// =============================================================================

async function runEnvelope<Options extends BaseEndpointOptions, TResponse>(
  opts: CreateHandlerOptions<Options>,
  request: HandlerRequest,
  shouldValidate: boolean,
): Promise<TResponse> {
  const {
    options,
    context: { getClient, config },
    isMultipart = false,
    responseSchema,
    errorSchema,
    urlParamsSchema,
    transformRequest,
    transformResponse,
  } = opts
  const { method, url } = options

  const client = getClient()
  const finalUrlPart = bindUrlParams<Options['url']>(url, request, urlParamsSchema)
  const finalRequest = transformRequest ? transformRequest(request) : request

  const result = await runRequest(
    client,
    makeConfig(finalRequest, options, method, finalUrlPart, isMultipart),
  )

  if (!result.ok) {
    if (config.onError) {
      const classified = classifyError(result.error, errorSchema)
      config.onError(buildErrorEvent(classified, { method, url }, result.error))
    }
    return buildErr(result.error, errorSchema) as TResponse
  }

  const raw = transformResponse ? transformResponse(result.response.data) : result.response.data
  try {
    const data = shouldValidate && responseSchema ? responseSchema.parse(raw) : raw
    return buildOk(data, result.response) as TResponse
  } catch (zerr) {
    // Validation or transform failed on a 2xx body. We already have a
    // successful HTTP response in hand, so any throw here is a validation
    // variant — keep Zod issues when available, empty list otherwise.
    const validationVariant: EnvelopeError = {
      kind: 'validation' as const,
      status: result.response.status,
      issues: zerr instanceof ZodError ? zerr.issues : [],
      body: raw,
    }
    if (config.onError) {
      config.onError(buildErrorEvent(validationVariant, { method, url }, zerr))
    }
    return {
      ok: false,
      data: null,
      error: validationVariant,
      response: toResponseMeta(result.response),
    } as TResponse
  }
}

async function runData<Options extends BaseEndpointOptions, TResponse>(
  opts: CreateHandlerOptions<Options>,
  request: HandlerRequest,
  shouldValidate: boolean,
): Promise<TResponse> {
  const {
    options,
    context: { getClient, config },
    isMultipart = false,
    responseSchema,
    urlParamsSchema,
    transformRequest,
    transformResponse,
  } = opts
  const { method, url } = options

  const client = getClient()
  const finalUrlPart = bindUrlParams<Options['url']>(url, request, urlParamsSchema)
  const finalRequest = transformRequest ? transformRequest(request) : request

  let response: AbstractResponse<unknown>
  try {
    response = await client.request(
      makeConfig(finalRequest, options, method, finalUrlPart, isMultipart),
    )
  } catch (error) {
    // HTTP failure path: classify (http / http-unknown / network), fire onError, rethrow.
    handleError(config, error, { method, url })
  }

  // 2xx path: a raw-body transform or schema validation failure here is a
  // validation outcome, not a network error. Mirror runEnvelope's handling so
  // the unified hook reports kind: 'validation' with the real HTTP status.
  const raw = transformResponse ? transformResponse(response.data) : response.data
  try {
    return (shouldValidate && responseSchema ? responseSchema.parse(raw) : raw) as TResponse
  } catch (zerr) {
    if (config.onError) {
      const validationVariant: EnvelopeError = {
        kind: 'validation' as const,
        status: response.status,
        issues: zerr instanceof ZodError ? zerr.issues : [],
        body: raw,
      }
      config.onError(buildErrorEvent(validationVariant, { method, url }, zerr))
    }
    throw zerr
  }
}

// =============================================================================
// Selector
// =============================================================================

export function createHandler<Options extends BaseEndpointOptions, TResponse>(
  opts: CreateHandlerOptions<Options>,
) {
  const resultMode = opts.options.result ?? opts.context.config.defaults?.result ?? 'data'
  const shouldValidate = opts.options.validateResponse !== false

  const handler = async (request: HandlerRequest = {} as HandlerRequest): Promise<TResponse> => {
    return resultMode === 'envelope'
      ? runEnvelope<Options, TResponse>(opts, request, shouldValidate)
      : runData<Options, TResponse>(opts, request, shouldValidate)
  }

  handler.config = opts.options

  return handler
}
