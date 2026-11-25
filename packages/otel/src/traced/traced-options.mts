import type { AttributeValue } from '@opentelemetry/api'

/**
 * Options for the @Traced decorator.
 */
export interface TracedOptions {
  /**
   * Custom span name.
   * If not provided, defaults to class.method name.
   */
  name?: string

  /**
   * Additional attributes to add to spans.
   */
  attributes?: Record<string, AttributeValue>
}
