import type { RequestContextHolder } from './request-context-holder.mjs'

import { DefaultRequestContextHolder } from './request-context-holder.mjs'

/**
 * RequestContextManager handles request context lifecycle management.
 * Extracted from ServiceLocator to improve separation of concerns.
 */
export class RequestContextManager {
  private readonly requestContexts = new Map<string, RequestContextHolder>()
  private currentRequestContext: RequestContextHolder | null = null

  constructor(private readonly logger: Console | null = null) {}

  /**
   * Begins a new request context with the given parameters.
   * @param requestId Unique identifier for this request
   * @param metadata Optional metadata for the request
   * @param priority Priority for resolution (higher = more priority)
   * @returns The created request context holder
   */
  beginRequest(
    requestId: string,
    metadata?: Record<string, any>,
    priority: number = 100,
  ): RequestContextHolder {
    if (this.requestContexts.has(requestId)) {
      throw new Error(
        `[RequestContextManager] Request context ${requestId} already exists`,
      )
    }

    const contextHolder = new DefaultRequestContextHolder(
      requestId,
      priority,
      metadata,
    )
    this.requestContexts.set(requestId, contextHolder)
    this.currentRequestContext = contextHolder

    this.logger?.log(
      `[RequestContextManager] Started request context: ${requestId}`,
    )
    return contextHolder
  }

  /**
   * Ends a request context and cleans up all associated instances.
   * @param requestId The request ID to end
   */
  async endRequest(requestId: string): Promise<void> {
    const contextHolder = this.requestContexts.get(requestId)
    if (!contextHolder) {
      this.logger?.warn(
        `[RequestContextManager] Request context ${requestId} not found`,
      )
      return
    }

    this.logger?.log(
      `[RequestContextManager] Ending request context: ${requestId}`,
    )

    // Clean up all request-scoped instances
    const cleanupPromises: Promise<any>[] = []
    for (const [, holder] of contextHolder.holders) {
      if (holder.destroyListeners.length > 0) {
        cleanupPromises.push(
          Promise.all(holder.destroyListeners.map((listener) => listener())),
        )
      }
    }

    await Promise.all(cleanupPromises)

    // Clear the context
    contextHolder.clear()
    this.requestContexts.delete(requestId)

    // Reset current context if it was the one being ended
    if (this.currentRequestContext === contextHolder) {
      this.currentRequestContext =
        Array.from(this.requestContexts.values()).at(-1) ?? null
    }

    this.logger?.log(
      `[RequestContextManager] Request context ${requestId} ended`,
    )
  }

  /**
   * Gets the current request context.
   * @returns The current request context holder or null
   */
  getCurrentRequestContext(): RequestContextHolder | null {
    return this.currentRequestContext
  }

  /**
   * Sets the current request context.
   * @param requestId The request ID to set as current
   */
  setCurrentRequestContext(requestId: string): void {
    const contextHolder = this.requestContexts.get(requestId)
    if (!contextHolder) {
      throw new Error(
        `[RequestContextManager] Request context ${requestId} not found`,
      )
    }
    this.currentRequestContext = contextHolder
  }

  /**
   * Gets all request contexts.
   * @returns Map of request contexts
   */
  getRequestContexts(): Map<string, RequestContextHolder> {
    return this.requestContexts
  }

  /**
   * Clears all request contexts.
   */
  async clearAllRequestContexts(): Promise<void> {
    const requestIds = Array.from(this.requestContexts.keys())

    if (requestIds.length === 0) {
      this.logger?.log('[RequestContextManager] No request contexts to clear')
      return
    }

    this.logger?.log(
      `[RequestContextManager] Clearing ${requestIds.length} request contexts: ${requestIds.join(', ')}`,
    )

    // Clear request contexts sequentially to avoid race conditions
    for (const requestId of requestIds) {
      try {
        await this.endRequest(requestId)
      } catch (error) {
        this.logger?.error(
          `[RequestContextManager] Error clearing request context ${requestId}:`,
          error,
        )
        // Continue with other request contexts even if one fails
      }
    }
  }
}
