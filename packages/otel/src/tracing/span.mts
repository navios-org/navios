import { context as otelContext, SpanStatusCode, trace } from '@opentelemetry/api'

import type { Attributes, Context, Span } from '@opentelemetry/api'

/** The name and the attributes a span starts with. */
export interface SpanDescription {
  name: string
  attributes: Attributes
}

/**
 * `describe`, computed once per key: per route, per handler. The other
 * arguments are used the first time only.
 */
export function describedOnce<K extends object, A extends unknown[]>(
  describe: (key: K, ...args: A) => SpanDescription,
): (key: K, ...args: A) => SpanDescription {
  const described = new WeakMap<K, SpanDescription>()
  return (key, ...args) => {
    let description = described.get(key)
    if (description === undefined) {
      description = describe(key, ...args)
      described.set(key, description)
    }
    return description
  }
}

/**
 * Adds an error to a span as an exception event, when it is an `Error`, and
 * returns the message for the status of the span.
 */
export function recordException(span: Span, error: unknown): string {
  if (error instanceof Error) {
    span.recordException(error)
    return error.message
  }
  return String(error)
}

/**
 * Records an error on a span and marks the span as failed.
 */
export function recordSpanError(span: Span, error: unknown): void {
  span.setStatus({ code: SpanStatusCode.ERROR, message: recordException(span, error) })
}

/**
 * Runs `fn` with `span` as the active span, in `parent`, so that spans
 * started inside it become its children. What it throws, or what the promise
 * it returns rejects with, is passed to `onError` and thrown again. `onReturn`
 * is called when it has returned, or its promise has resolved.
 */
export function runInSpan<T>(
  span: Span,
  parent: Context,
  fn: () => T,
  onError: (error: unknown) => void,
  onReturn?: () => void,
): T {
  let result: T
  try {
    result = otelContext.with(trace.setSpan(parent, span), fn)
  } catch (error) {
    onError(error)
    throw error
  }
  if (result instanceof Promise) {
    return result.then(
      onReturn &&
        ((value: unknown) => {
          onReturn()
          return value
        }),
      (error: unknown) => {
        onError(error)
        throw error
      },
    ) as T
  }
  onReturn?.()
  return result
}
