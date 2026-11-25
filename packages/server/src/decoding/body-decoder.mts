import { HttpException } from '../errors/http-exception.mjs'
import { ValidationError } from '../errors/validation-error.mjs'
import { isPromise } from '../internal/promises.mjs'

import type { RequestContext } from '../context/request-context.mjs'
import type { MaybePromise } from '../internal/promises.mjs'
import type { RouteEndpointConfig, SchemaLike } from '../routing/endpoint-config.mjs'
import type { BodyPart, BodySource } from '../routing/route-input.mjs'

import { isJsonType, mediaType } from './media-type.mjs'
import { createMultipartCollector } from './multipart-collector.mjs'
import { parseJson } from './parse-json.mjs'

import type { MultipartCollector } from './multipart-collector.mjs'

/** Decodes the body of a request into what `requestSchema` validates. */
export type BodyDecoder = (ctx: RequestContext, source: BodySource) => MaybePromise<unknown>

/** Drops a byte order mark, and takes invalid sequences for replacement characters. */
const utf8 = new TextDecoder()

function decodeJson(bytes: Uint8Array): unknown {
  try {
    return parseJson(utf8.decode(bytes))
  } catch (error) {
    throw new ValidationError('body', [{ message: (error as Error).message }])
  }
}

function decodeText(bytes: Uint8Array): unknown {
  return utf8.decode(bytes)
}

function unsupported(contentType: string | undefined, expected: string): HttpException {
  return new HttpException(
    415,
    contentType === undefined
      ? `The request body has no content type; ${expected} is expected`
      : `A request body of the type ${JSON.stringify(contentType)} is not supported; ` +
          `${expected} is expected`,
  )
}

/**
 * How a body is decoded, from its media type and nothing else. A request that
 * a browser sends across sites without asking first (`text/plain`, a form, no
 * content type at all) is never read as JSON.
 */
function decodeByType(contentType: string | undefined): (bytes: Uint8Array) => unknown {
  if (contentType === 'application/json') {
    return decodeJson
  }
  const type = mediaType(contentType)
  if (type !== undefined && isJsonType(type)) {
    return decodeJson
  }
  if (type?.startsWith('text/')) {
    return decodeText
  }
  throw unsupported(contentType, 'application/json')
}

function decodeParts(
  ctx: RequestContext,
  schema: SchemaLike | undefined,
): Promise<Record<string, unknown>> {
  const collector = createMultipartCollector(schema)
  const parts = ctx.bodyParts()
  if (Symbol.asyncIterator in parts) {
    return collectParts(parts, collector)
  }
  return parts.then((all) => {
    for (const { name, value } of all) {
      collector.add(name, value)
    }
    return collector.result()
  })
}

async function collectParts(
  parts: AsyncIterable<BodyPart>,
  collector: MultipartCollector,
): Promise<Record<string, unknown>> {
  for await (const { name, value } of parts) {
    collector.add(name, value)
  }
  return collector.result()
}

/**
 * Builds the decoder of an endpoint's body. Runs after guards, and only for
 * an endpoint that reads a body. No body is `undefined`, whatever its type.
 */
export function compileBodyDecoder(config: RouteEndpointConfig): BodyDecoder {
  const { requestSchema } = config
  if (config.body === 'multipart') {
    return (ctx, source) => {
      const parsed = source.parsed?.()
      if (parsed !== undefined) {
        return parsed.value
      }
      if (source.isEmpty) {
        return undefined
      }
      const { contentType } = source
      if (mediaType(contentType) !== 'multipart/form-data') {
        throw unsupported(contentType, 'multipart/form-data')
      }
      return decodeParts(ctx, requestSchema)
    }
  }
  return (ctx, source) => {
    const parsed = source.parsed?.()
    if (parsed !== undefined) {
      return parsed.value
    }
    if (source.isEmpty) {
      return undefined
    }
    const decode = decodeByType(source.contentType)
    const bytes = ctx.bodyBytes()
    if (isPromise(bytes)) {
      return bytes.then((read) => (read.byteLength === 0 ? undefined : decode(read)))
    }
    return bytes.byteLength === 0 ? undefined : decode(bytes)
  }
}
