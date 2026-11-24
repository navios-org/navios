import type { BaseEndpointOptions, ServerRequestArgs } from '@navios/builder'
import type { InferInput, StandardSchemaV1 } from '@navios/di'

import type { RequestContext } from '../context/request-context.mjs'
import type { EndpointReply } from '../routing/reply.mjs'
import type { SseStream } from '../routing/sse.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Anything with a builder declaration's `config`.
 */
export interface EndpointDeclaration<Config extends BaseEndpointOptions = BaseEndpointOptions> {
  config: Config
}

type RepliesOf<Record_> = {
  [Status in keyof Record_ & number]: Record_[Status] extends StandardSchemaV1
    ? EndpointReply<Status, InferInput<Record_[Status]>>
    : EndpointReply<Status, undefined>
}[keyof Record_ & number]

/** `reply(status, body)` values for the statuses declared in `errorSchema`. */
export type ErrorRepliesOf<Config> = Config extends {
  errorSchema: infer Errors extends Record<number, StandardSchemaV1>
}
  ? RepliesOf<Errors>
  : never

type SuccessReturnOf<Config> = Config extends { response: 'void' }
  ? void
  : Config extends { responses: infer Responses extends Record<number, StandardSchemaV1 | null> }
    ? RepliesOf<Responses>
    : Config extends { response: 'stream' }
      ? ReadableStream | AsyncIterable<unknown> | SseStream
      : Config extends { response: 'text' }
        ? string | ReadableStream | AsyncIterable<unknown>
        : Config extends { response: 'blob' }
          ? Blob | ArrayBuffer | Uint8Array | ReadableStream
          : Config extends { responseSchema: infer Schema extends StandardSchemaV1 }
            ? InferInput<Schema>
            : unknown

/**
 * What a handler for this endpoint configuration may return: the declared
 * success value, or `reply()` with a declared error status.
 */
export type HandlerReturnOf<Config> = SuccessReturnOf<Config> | ErrorRepliesOf<Config>

/**
 * The first argument of a handler for `typeof endpoint`: validated
 * `urlParams`, `params` (query) and `data` (body), as declared.
 */
export type HandlerParams<Endpoint extends EndpointDeclaration> = ServerRequestArgs<
  Endpoint['config']
>

/**
 * The return type of a handler for `typeof endpoint`.
 */
export type HandlerResult<Endpoint extends EndpointDeclaration> = Promise<
  HandlerReturnOf<Endpoint['config']>
>

export type HandlerFunction<Config extends BaseEndpointOptions> = (
  params: ServerRequestArgs<Config>,
  ctx: RequestContext,
) => HandlerReturnOf<Config> | Promise<HandlerReturnOf<Config>>

export type AnyHandlerFunction = (params: any, ctx: RequestContext) => unknown
