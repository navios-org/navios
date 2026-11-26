import { bindUrlParams, getUrlParamNames } from '../shared/bind-url-params.mjs'
import { callErrorHook } from '../shared/call-error-hook.mjs'
import { NaviosError } from '../shared/navios-error.mjs'
import { validate } from '../shared/validate.mjs'

import type { Schema } from '../shared/schema.mjs'
import type { ValidationOutcome } from '../shared/validate.mjs'

import { EndpointError } from './endpoint-error.mjs'
import { makeConfig } from './make-config.mjs'
import { toResponseMeta } from './response-meta.mjs'
import { classifyTransportFailure } from './transport-failure.mjs'

import type { BuilderContext } from './builder-config.mjs'
import type { AbstractRequestConfig, AbstractResponse, Client } from './client.mjs'
import type { EndpointErrorInit, RequestPart } from './endpoint-error.mjs'
import type { BaseEndpointOptions } from './endpoint-options.mjs'
import type { SafeResult } from './safe-result.mjs'

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

/** What one call has got to, for the context of the `onError` hook. */
interface Attempt {
  /** The request config, once one was built. */
  request: AbstractRequestConfig | null
}

/** Loosely-typed per-call options, as the runtime sees them. */
export interface HandlerCallOptions {
  client?: Client
}

function getResponse(error: unknown): AbstractResponse<unknown> | null {
  if (typeof error !== 'object' || error === null) return null
  if (!('response' in error) || !error.response) return null
  const response = error.response as AbstractResponse<unknown>
  return typeof response.status === 'number' ? response : null
}

function isSuccessStatus(status: unknown): boolean {
  // A client that reports no numeric status is trusted: it resolved, so it succeeded.
  return typeof status !== 'number' || (status >= 200 && status < 300)
}

/**
 * What `JSON.stringify` throws for a body, when that is why the client failed.
 * From here it looks like a network failure. A client that can send more than
 * JSON (a `BigInt`) fails for other reasons, whose messages differ.
 */
function serializationError(data: unknown, failure: unknown): Error | undefined {
  try {
    JSON.stringify(data)
  } catch (error) {
    const { message, cause } = (failure ?? {}) as Partial<Error> & { cause?: Partial<Error> }
    if (!(error instanceof Error)) return undefined
    if (error.message === message || error.message === cause?.message) return error
  }
  return undefined
}

/** The problems of all invalid parts, or `null` when every part is valid. */
function invalidParts(
  parts: Record<RequestPart, ValidationOutcome>,
): Pick<EndpointErrorInit, 'issues' | 'cause'> | null {
  const invalid = (Object.keys(parts) as RequestPart[]).flatMap((part) => {
    const outcome = parts[part]
    return outcome.ok ? [] : [{ part, ...outcome }]
  })
  if (invalid.length === 0) return null
  return {
    issues: invalid.flatMap(({ part, issues }) =>
      issues.map(({ message, path }) => ({ message, path, part })),
    ),
    cause: invalid[0]!.cause,
  }
}

/**
 * Checks, once, that an endpoint's declaration is internally consistent. The
 * types reject most of this as well, but not for options of a wider type.
 *
 * @throws {NaviosError} when options contradict each other, or when
 *   `urlParamsSchema` keys differ from the URL's `$param` names.
 */
function assertValidDeclaration(options: BaseEndpointOptions): void {
  const { urlParamsSchema, url, method, response = 'json' } = options
  const invalid = (reason: string) => new NaviosError(`[Navios-API]: ${method} ${url} ${reason}`)

  if (options.responses && options.responseSchema) {
    throw invalid('declares both responses and responseSchema')
  }
  if (response !== 'json' && (options.responses || options.responseSchema)) {
    throw invalid(`declares a response schema, which response: '${response}' does not use`)
  }
  if (
    (method === 'GET' || method === 'HEAD') &&
    (options.requestSchema || options.body === 'multipart')
  ) {
    throw invalid('declares a body, which a GET or HEAD request cannot have')
  }
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
    throw invalid(
      `has a urlParamsSchema that does not match its URL parameters (${parts.join('; ')})`,
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
export function createHandler(options: BaseEndpointOptions, context: BuilderContext) {
  assertValidDeclaration(options)

  const { method, url, errorSchema } = options
  const endpoint = { method, url }
  const responseKind = options.response ?? 'json'
  const shouldValidate = options.validateResponse !== false
  const { responses } = options
  const sendOutput = context.config.send === 'output'
  const urlParamNames = options.urlParamsSchema ? getUrlParamNames(url) : []

  function fail(
    attempt: Attempt,
    init: Omit<EndpointErrorInit, 'endpoint'>,
  ): SafeResult<never, EndpointError> {
    const error = new EndpointError({ ...init, endpoint })
    callErrorHook(context.config.onError, error, 'Navios-API', { request: attempt.request })
    return { ok: false, data: null, error, response: error.response }
  }

  async function failHttp(attempt: Attempt, response: AbstractResponse<unknown>, cause: unknown) {
    const meta = toResponseMeta(response)
    const status = response.status
    const schema = errorSchema?.[status]

    if (!schema) {
      return fail(attempt, {
        kind: 'http-unknown',
        status,
        body: response.data,
        response: meta,
        cause,
      })
    }

    const parsed = await validate(schema, response.data)
    if (parsed.ok) {
      return fail(attempt, { kind: 'http', status, body: parsed.value, response: meta, cause })
    }
    return fail(attempt, {
      kind: 'response-validation',
      status,
      body: response.data,
      issues: parsed.issues,
      response: meta,
      cause: parsed.cause,
    })
  }

  /** Validates one part of the input; `undefined` schema passes it through. */
  async function validateInput(
    schema: Schema | undefined,
    value: unknown,
  ): Promise<ValidationOutcome> {
    return schema ? validate(schema, value) : { ok: true, value }
  }

  /**
   * Validates the body or the query. Either may be left out when its schema
   * accepts `undefined` or has no required fields (the call signature makes it
   * optional in both cases), so one that was is also tried as an empty object.
   * `input` is the value that was accepted; `asEmpty` why an empty object was not.
   */
  async function validateOptional(
    schema: Schema | undefined,
    value: unknown,
  ): Promise<{ outcome: ValidationOutcome; input: unknown; asEmpty?: ValidationOutcome }> {
    const outcome = await validateInput(schema, value)
    if (outcome.ok || value !== undefined || !schema) return { outcome, input: value }
    const asEmpty = await validate(schema, {})
    return asEmpty.ok ? { outcome: asEmpty, input: {} } : { outcome, input: value, asEmpty }
  }

  /**
   * The URL params to send. One that was left out has no input to send, and a
   * URL has to have it, so it is what the schema produced: its default.
   */
  function fillUrlParams(input: HandlerRequest['urlParams'], output: unknown) {
    const leftOut = urlParamNames.filter((name) => (input?.[name] ?? null) === null)
    if (leftOut.length === 0) return input
    const defaults = (output ?? {}) as Record<string, unknown>
    return { ...input, ...Object.fromEntries(leftOut.map((name) => [name, defaults[name]])) }
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
    const attempt: Attempt = { request: null }
    try {
      return await execute(attempt, request ?? {}, callOptions ?? {})
    } catch (cause) {
      return fail(attempt, {
        kind: 'network',
        message: `${method} ${url} failed: ${cause instanceof Error ? cause.message : 'unexpected error'}`,
        cause,
      })
    }
  }

  async function execute(
    attempt: Attempt,
    request: HandlerRequest,
    callOptions: HandlerCallOptions,
  ): Promise<SafeResult<unknown, EndpointError>> {
    // 1. Resolve the client.
    let client: Client
    try {
      client = callOptions.client ?? context.getClient()
    } catch (cause) {
      return fail(attempt, {
        kind: 'config',
        message: cause instanceof Error ? cause.message : undefined,
        cause,
      })
    }

    // 2. Validate input and build the request. Nothing is sent on failure.
    const body = await validateOptional(options.requestSchema, request.data)
    const query = await validateOptional(options.querySchema, request.params ?? undefined)
    const parts = {
      urlParams: await validateInput(options.urlParamsSchema, request.urlParams),
      // A query is an object, so the fields it lacks say more than that it is missing
      params: query.asEmpty ?? query.outcome,
      data: body.outcome,
    }
    const invalid = invalidParts(parts)
    if (invalid) {
      return fail(attempt, { kind: 'request-validation', ...invalid })
    }

    let config: AbstractRequestConfig
    try {
      // The schemas describe what is on the wire by their input, and a Navios
      // server parses it as such: sending their output would apply transforms
      // twice.
      const sent = sendOutput
        ? {
            urlParams: (parts.urlParams as { value: unknown }).value,
            params: (parts.params as { value: unknown }).value,
            data: (parts.data as { value: unknown }).value,
          }
        : {
            urlParams: fillUrlParams(
              request.urlParams,
              (parts.urlParams as { value: unknown }).value,
            ),
            params: request.params,
            data: body.input,
          }
      const validated = { ...request, ...sent } as HandlerRequest
      config = makeConfig(validated, options, bindUrlParams(url, validated))
      attempt.request = config
    } catch (cause) {
      return fail(attempt, {
        kind: 'config',
        message: cause instanceof Error ? `${method} ${url}: ${cause.message}` : undefined,
        cause,
      })
    }

    // 3. Send it.
    let response: AbstractResponse<unknown>
    try {
      response = await client.request(config, { endpoint: options, args: request })
    } catch (cause) {
      const errorResponse = getResponse(cause)
      if (errorResponse && !isSuccessStatus(errorResponse.status)) {
        return failHttp(attempt, errorResponse, cause)
      }
      if (errorResponse && !request.signal?.aborted) {
        // The server answered with a success status and the client still
        // rejected: it could not read the body as what the endpoint expects.
        return fail(attempt, {
          kind: 'response-validation',
          status: errorResponse.status,
          body: errorResponse.data,
          issues: [
            {
              message: `Response body could not be parsed${cause instanceof Error ? `: ${cause.message}` : ''}`,
            },
          ],
          response: toResponseMeta(errorResponse),
          cause,
        })
      }
      const unsendable =
        options.body === 'multipart' ? undefined : serializationError(config.data, cause)
      if (unsendable) {
        return fail(attempt, {
          kind: 'config',
          message: `${method} ${url}: the body cannot be serialised: ${unsendable.message}`,
          cause,
        })
      }
      return fail(attempt, { kind: classifyTransportFailure(cause, request.signal), cause })
    }

    if (typeof response !== 'object' || response === null) {
      return fail(attempt, {
        kind: 'network',
        message: `${method} ${url} failed: the HTTP client resolved without a response`,
        cause: response,
      })
    }

    // 4. The builder, not the client, decides what counts as success.
    if (!isSuccessStatus(response.status)) {
      return failHttp(attempt, response, undefined)
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
      return fail(attempt, {
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
    return fail(attempt, {
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
