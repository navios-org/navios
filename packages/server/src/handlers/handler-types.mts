import type { BaseEndpointOptions, ServerRequestArgs } from '@navios/builder'
import type { InferInput, StandardSchemaV1 } from '@navios/di'

import type { RequestContext } from '../context/request-context.mjs'
import type { CustomResult } from '../responses/custom-result.mjs'
import type { EndpointReply } from '../responses/reply.mjs'
import type { SseStream } from '../sse/sse-stream.mjs'

import type { EndpointDeclaration } from './endpoint-declaration.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

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
      ? ReadableStream | AsyncIterable<string | Uint8Array> | SseStream | CustomResult
      : Config extends { response: 'text' }
        ? string | ReadableStream | AsyncIterable<string | Uint8Array> | CustomResult
        : Config extends { response: 'blob' }
          ? Blob | ArrayBuffer | Uint8Array | ReadableStream | CustomResult
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

type Opaque =
  | Date
  | RegExp
  | Blob
  | ArrayBuffer
  | ArrayBufferView
  | ReadableStream
  | Promise<unknown>
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | SseStream
  | CustomResult
  | ((...args: any[]) => unknown)

/**
 * The declared return type with literal types widened to their primitives:
 * `'a' | 'b'` becomes `string`.
 *
 * TypeScript does not pass an expected type into the body of a decorated
 * method, so `return { status: 'ok' }` is inferred as `{ status: string }`.
 * Checking a method against the widened type lets it be written without a
 * return annotation while its shape is still checked.
 */
export type Widened<T> = 0 extends 1 & T
  ? T
  : T extends string
    ? string
    : T extends number
      ? number
      : T extends boolean
        ? boolean
        : T extends bigint
          ? bigint
          : T extends EndpointReply<infer Status, infer Body>
            ? EndpointReply<Status, Widened<Body>>
            : T extends Opaque
              ? T
              : T extends object
                ? { [Key in keyof T]: Widened<T[Key]> }
                : T

/**
 * A controller method accepted by `@Endpoint`.
 *
 * The parameters are the declared ones. The return value is checked for its
 * shape, with literal types widened (see {@link Widened}); annotate the
 * method with `HandlerResult<typeof endpoint>` to check literals as well.
 */
export type MethodHandlerFunction<Config extends BaseEndpointOptions> = (
  params: ServerRequestArgs<Config>,
  ctx: RequestContext,
) => Widened<HandlerReturnOf<Config>> | Promise<Widened<HandlerReturnOf<Config>>>
