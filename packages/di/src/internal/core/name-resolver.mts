import { InjectableScope } from '../../enums/index.mjs'

import type { InjectionTokenType } from '../../token/injection-token.mjs'

/**
 * Simple LRU cache for instance name generation.
 * Uses a Map which maintains insertion order for efficient LRU eviction.
 */
class InstanceNameCache {
  private readonly cache = new Map<string, string>()
  private readonly maxSize: number

  constructor(maxSize = 1000) {
    this.maxSize = maxSize
  }

  get(key: string): string | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key)
      this.cache.set(key, value)
    }
    return value
  }

  set(key: string, value: string): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
    this.cache.set(key, value)
  }

  clear(): void {
    this.cache.clear()
  }
}

/**
 * Simple hash function for deterministic hashing of arguments
 */
function hashArgs(args: any): string {
  const str = JSON.stringify(args, Object.keys(args || {}).sort())
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Handles instance name generation with support for requestId and scope.
 *
 * Generates unique instance identifiers based on token, arguments, and scope.
 * Request-scoped services MUST include requestId in their name for proper isolation.
 */
export class NameResolver {
  private readonly instanceNameCache = new InstanceNameCache()

  constructor(private readonly logger: Console | null = null) {}

  /**
   * Generates a unique instance name based on token, arguments, requestId, and scope.
   *
   * Name formats:
   * - Singleton/Transient without args: `${tokenId}`
   * - Singleton/Transient with args: `${tokenId}:${argsHash}`
   * - Request without args: `${tokenId}:requestId=${requestId}`
   * - Request with args: `${tokenId}:requestId=${requestId}:${argsHash}`
   *
   * @param token The injection token
   * @param args Optional arguments
   * @param requestId Optional request ID (required for request-scoped services)
   * @param scope Optional scope (used to determine if requestId should be included)
   * @returns The generated instance name
   */
  generateInstanceName(
    token: InjectionTokenType,
    args?: any,
    requestId?: string,
    scope?: InjectableScope,
  ): string {
    const tokenStr = token.toString()
    const isRequest = scope === InjectableScope.Request

    // For request-scoped services, requestId is required
    if (isRequest && !requestId) {
      throw new Error(`[NameResolver] requestId is required for request-scoped services`)
    }

    // Build cache key
    const cacheKey = `${tokenStr}:${scope}:${requestId || ''}:${args ? JSON.stringify(args) : ''}`

    // Check cache first
    const cached = this.instanceNameCache.get(cacheKey)
    if (cached !== undefined) {
      return cached
    }

    // Generate the instance name
    let result = tokenStr

    // Add requestId for request-scoped services
    if (isRequest && requestId) {
      result = `${result}:requestId=${requestId}`
    }

    // Add args hash if args are provided
    if (args) {
      const argsHash = hashArgs(args)
      result = `${result}:${argsHash}`
    }

    // Cache the result
    this.instanceNameCache.set(cacheKey, result)

    return result
  }

  /**
   * Upgrades an existing instance name to include requestId.
   * Preserves any args hash that might already be in the name.
   *
   * Examples:
   * - `TokenName` → `TokenName:requestId=req-123`
   * - `TokenName:abc123` → `TokenName:requestId=req-123:abc123`
   *
   * @param existingName The existing instance name (without requestId)
   * @param requestId The request ID to add
   * @returns The upgraded instance name with requestId
   */
  upgradeInstanceNameToRequest(existingName: string, requestId: string): string {
    // Check if requestId is already in the name
    if (existingName.includes(`:requestId=${requestId}`)) {
      return existingName
    }

    // Find where to insert requestId
    // Format: TokenName or TokenName:argsHash
    // We want: TokenName:requestId=req-123 or TokenName:requestId=req-123:argsHash

    // Check if there's an args hash (starts after first colon, but not requestId=)
    const requestIdPattern = /:requestId=/
    const hasRequestId = requestIdPattern.test(existingName)

    if (hasRequestId) {
      // Already has a requestId, don't upgrade
      return existingName
    }

    // Find the token part (everything before first colon, or entire string if no colon)
    const colonIndex = existingName.indexOf(':')
    if (colonIndex === -1) {
      // No colon, just token name: TokenName → TokenName:requestId=req-123
      return `${existingName}:requestId=${requestId}`
    }

    // Has colon, means there's an args hash: TokenName:abc123 → TokenName:requestId=req-123:abc123
    const tokenPart = existingName.substring(0, colonIndex)
    const argsPart = existingName.substring(colonIndex + 1)

    // Check if argsPart looks like an args hash (not requestId=)
    if (argsPart.startsWith('requestId=')) {
      // Already has requestId, return as is
      return existingName
    }

    return `${tokenPart}:requestId=${requestId}:${argsPart}`
  }

  /**
   * Formats a single argument value for instance name generation.
   */
  formatArgValue(value: any): string {
    if (typeof value === 'function') {
      return `fn_${value.name}(${value.length})`
    }
    if (typeof value === 'symbol') {
      return value.toString()
    }
    return JSON.stringify(value).slice(0, 40)
  }
}
