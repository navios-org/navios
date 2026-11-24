import type { BaseEndpointOptions } from '@navios/builder'
import type { z, ZodType } from 'zod/v4'

import { hasExplicitSuccessStatusCode, setDefaultSuccessStatusCode } from '../metadata/index.mjs'

import type { HandlerMetadata } from '../metadata/index.mjs'
import type { EndpointReply } from '../utils/reply.mjs'

import { httpCodeOnResponsesEndpoint } from './http-code-on-responses.error.mjs'

import type { ZodBaseEndpointOptions, ZodEndpointOptions } from './zod-endpoint-options.mjs'

// =============================================================================
// Which declarations each decorator accepts
// =============================================================================

/**
 * A per-status `responses` map: a Zod schema for a status with a body, `null`
 * for a status without one.
 */
export type ZodResponsesRecord = NonNullable<ZodBaseEndpointOptions['responses']>

/** The response side of a JSON declaration: a reply validated with `responseSchema`. */
type JsonResponseConfig = ZodEndpointOptions & {
  response?: 'json'
}

/** The response side of a `response: 'void'` declaration: a reply without a body. */
type VoidResponseConfig = ZodBaseEndpointOptions & {
  response: 'void'
  responses?: undefined
}

/** The response side of a declaration with a per-status `responses` map. */
type ResponsesResponseConfig = ZodBaseEndpointOptions & {
  response?: 'json'
  responses: ZodResponsesRecord
}

/**
 * The three ways a declaration served by `@Endpoint` or `@Multipart` describes
 * its reply, whatever its request body: a `responseSchema` (`response` absent
 * or `'json'`), `response: 'void'`, or a per-status `responses` map.
 */
export type EndpointResponseConfig =
  | JsonResponseConfig
  | VoidResponseConfig
  | ResponsesResponseConfig

/**
 * A declaration `@Endpoint` serves as JSON: a JSON (or absent) request body
 * and a JSON response validated with `responseSchema`.
 */
export type JsonEndpointConfig = JsonResponseConfig & {
  body?: 'json'
}

/**
 * A declaration `@Endpoint` serves without a response body
 * (`response: 'void'`): the handler returns nothing and the reply is 204.
 */
export type VoidEndpointConfig = VoidResponseConfig & {
  body?: 'json'
}

/**
 * A declaration `@Endpoint` serves with a per-status `responses` map: the
 * handler picks the status and its body with `reply(status, body)`.
 */
export type ResponsesEndpointConfig = ResponsesResponseConfig & {
  body?: 'json'
}

/**
 * Declarations accepted by `@Endpoint`: `body` absent or `'json'`, and either
 * a `responseSchema` (`response` absent or `'json'`), `response: 'void'`, or
 * a per-status `responses` map.
 */
export type EndpointDecoratorConfig =
  | JsonEndpointConfig
  | VoidEndpointConfig
  | ResponsesEndpointConfig

/**
 * What the handler of a `responses` endpoint returns: one `reply(...)` result
 * per declared status. The body is the input of that status's schema, or
 * absent for a `null` entry.
 *
 * @example
 * ```typescript
 * type Replies = EndpointRepliesOf<{ 200: typeof userSchema; 204: null }>
 * // EndpointReply<200, { id: string }> | EndpointReply<204, undefined>
 * ```
 */
export type EndpointRepliesOf<Responses extends ZodResponsesRecord> = {
  [Status in keyof Responses & number]: Responses[Status] extends ZodType
    ? EndpointReply<Status, z.input<Responses[Status]>>
    : EndpointReply<Status, undefined>
}[keyof Responses & number]

/**
 * Declarations accepted by `@Multipart`: `body: 'multipart'`, and on the
 * response side exactly what `@Endpoint` accepts — a `responseSchema`
 * (`response` absent or `'json'`), `response: 'void'`, or a per-status
 * `responses` map.
 */
export type MultipartDecoratorConfig = EndpointResponseConfig & {
  body: 'multipart'
}

/**
 * Declarations accepted by `@Stream`: `response` is `'blob'`, `'text'` or
 * `'stream'`.
 */
export type StreamDecoratorConfig = ZodBaseEndpointOptions & {
  response: 'blob' | 'text' | 'stream'
  responses?: undefined
}

// =============================================================================
// Runtime check
// =============================================================================

type DecoratorName = 'Endpoint' | 'Multipart' | 'Stream'
type BodyKind = NonNullable<BaseEndpointOptions['body']>
type ResponseKind = NonNullable<BaseEndpointOptions['response']>

interface Requirement<Kind> {
  allowed: readonly Kind[]
  /** What the decorator needs, in words, for the error message. */
  needs: string
}

const rules: Record<
  DecoratorName,
  { body?: Requirement<BodyKind>; response?: Requirement<ResponseKind> }
> = {
  Endpoint: {
    body: { allowed: ['json'], needs: `body: 'json' (or no body option)` },
    response: {
      allowed: ['json', 'void'],
      needs: `response: 'json' or 'void' (or no response option)`,
    },
  },
  Multipart: {
    body: { allowed: ['multipart'], needs: `body: 'multipart'` },
    response: {
      allowed: ['json', 'void'],
      needs: `response: 'json' or 'void' (or no response option)`,
    },
  },
  Stream: {
    response: {
      allowed: ['blob', 'text', 'stream'],
      needs: `response: 'blob', 'text' or 'stream'`,
    },
  },
}

/** The decorator that serves a given declared kind. */
const servedBy: Record<BodyKind | ResponseKind, DecoratorName> = {
  json: 'Endpoint',
  void: 'Endpoint',
  multipart: 'Multipart',
  blob: 'Stream',
  text: 'Stream',
  stream: 'Stream',
}

function mismatch(
  decorator: DecoratorName,
  config: Pick<BaseEndpointOptions, 'method' | 'url'>,
  option: 'body' | 'response',
  declared: BodyKind | ResponseKind | undefined,
  needs: string,
): Error {
  const what =
    declared === undefined
      ? `without a ${option} option (so ${option}: 'json')`
      : `with ${option}: '${declared}'`
  // No other decorator reads a multipart body, so there is nothing to suggest
  // when a multipart endpoint declares a blob, text or stream response.
  const hint =
    decorator === 'Multipart' && option === 'response'
      ? 'Change the declaration.'
      : `Change the declaration or use @${servedBy[declared ?? 'json']}.`
  return new Error(
    `[Navios] @${decorator} cannot serve ${config.method} ${config.url}: the endpoint is declared ${what}, but @${decorator} needs ${needs}. ${hint}`,
  )
}

/**
 * Checks that a decorator is applied to a declaration it can serve.
 *
 * The declaration's `body` / `response` options say how the client encodes
 * the request and reads the reply; the decorator picks the server adapter.
 * The two have to agree, otherwise client and server speak different formats.
 *
 * - `@Endpoint`: `body` absent or `'json'`; `response` absent, `'json'` or `'void'`
 * - `@Multipart`: `body: 'multipart'`; `response` absent, `'json'` or `'void'`
 * - `@Stream`: `response` is `'blob'`, `'text'` or `'stream'`
 *
 * A per-status `responses` map is served by `@Endpoint` and `@Multipart`, not
 * by `@Stream`, and replaces `response: 'void'` rather than combining with it.
 *
 * @throws {Error} naming the decorator, the endpoint, what was declared and
 *   what the decorator needs.
 */
export function assertDeclarationMatchesDecorator(
  decorator: DecoratorName,
  config: Pick<BaseEndpointOptions, 'method' | 'url' | 'body' | 'response' | 'responses'>,
): void {
  const { body, response } = rules[decorator]

  if (config.responses) {
    const reason =
      decorator === 'Stream'
        ? `the endpoint is declared with a per-status responses map, which only @Endpoint and @Multipart serve. Change the declaration or use one of them.`
        : config.response === 'void'
          ? `the endpoint is declared with both a per-status responses map and response: 'void'. Keep one of them: a status without a body is a null entry in responses.`
          : null
    if (reason) {
      throw new Error(
        `[Navios] @${decorator} cannot serve ${config.method} ${config.url}: ${reason}`,
      )
    }
  }

  if (body && !body.allowed.includes(config.body ?? 'json')) {
    throw mismatch(decorator, config, 'body', config.body, body.needs)
  }
  if (response && !response.allowed.includes(config.response ?? 'json')) {
    throw mismatch(decorator, config, 'response', config.response, response.needs)
  }
}

/**
 * Settles the success status of a handler served by `@Endpoint` or
 * `@Multipart` from its declaration.
 *
 * - With a per-status `responses` map the method picks the status with
 *   `reply()`, so an `@HttpCode` already applied is an error.
 * - With `response: 'void'` there is no body to send: 204, unless `@HttpCode`
 *   says otherwise.
 *
 * @throws {Error} when `@HttpCode` was applied to a `responses` endpoint.
 */
export function applyDeclaredSuccessStatus(
  metadata: HandlerMetadata<any>,
  config: Pick<BaseEndpointOptions, 'method' | 'url' | 'response' | 'responses'>,
): void {
  if (config.responses) {
    if (hasExplicitSuccessStatusCode(metadata)) {
      throw httpCodeOnResponsesEndpoint(config)
    }
  } else if (config.response === 'void') {
    setDefaultSuccessStatusCode(metadata, 204)
  }
}
