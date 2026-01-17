import { inject } from '@navios/core'
import { Injectable } from '@navios/core/legacy-compat'
import { Traced } from '@navios/otel/legacy-compat'

/**
 * Processing service demonstrating nested spans and custom span attributes.
 *
 * This service shows how to use @Traced with custom options for more
 * fine-grained control over span names and attributes.
 */
@Injectable()
export class ProcessingService {
  /**
   * Simulate a slow operation with configurable delay.
   * Creates span: "slow-operation" with delay attribute.
   */
  @Traced({ name: 'slow-operation', attributes: { 'operation.type': 'delay' } })
  async simulateSlowOperation(delayMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  /**
   * Process a chain of operations to demonstrate nested spans.
   * Each recursive call creates a child span.
   */
  @Traced({ name: 'chain-processor' })
  async processChain(depth: number): Promise<string> {
    if (depth <= 0) {
      return 'completed'
    }

    // Simulate some work
    await this.doWork(depth)

    // Recursive call creates nested spans
    const result = await this.processChain(depth - 1)

    return `step-${depth} -> ${result}`
  }

  /**
   * Internal work method.
   * Creates span: "chain-work" with depth attribute.
   */
  @Traced({ name: 'chain-work' })
  private async doWork(depth: number): Promise<void> {
    // Simulate work proportional to depth
    await new Promise((resolve) => setTimeout(resolve, 50 * depth))
  }

  /**
   * Validate input data.
   * Creates span: "data-validation"
   */
  @Traced({ name: 'data-validation', attributes: { 'validation.strict': true } })
  async validate(data: unknown): Promise<boolean> {
    // Simulate validation
    await new Promise((resolve) => setTimeout(resolve, 10))
    return data !== null && data !== undefined
  }

  /**
   * Transform data.
   * Creates span: "data-transformation"
   */
  @Traced({ name: 'data-transformation' })
  async transform<T>(data: T): Promise<T> {
    // Simulate transformation
    await new Promise((resolve) => setTimeout(resolve, 20))
    return data
  }
}
