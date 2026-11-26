import { runInContext, settledWithin } from '@navios/core/transport'

import type { RequestContext } from '../context/request-context.mjs'
import type { RequestHost } from '../context/request-host.mjs'

import type { BodyOwner, ManagedBody, Source } from './managed-body.mjs'

/**
 * How long the release of a request waits for its bodies to close. A
 * generator that waits for something that never comes cannot be closed, and
 * must not keep the rest from being released.
 */
const CLOSE_TIMEOUT_MS = 1000

/**
 * A request as the owner of the bodies it has produced.
 * @internal
 */
export class RequestOwner implements BodyOwner {
  constructor(
    private readonly ctx: RequestContext,
    private readonly host: RequestHost,
  ) {}

  get name(): string {
    return `${this.ctx.method} ${this.ctx.route.path}`
  }

  step<Step extends keyof Source>(source: Source, step: Step): ReturnType<Source[Step]> {
    return this.host.asyncContext
      ? runInContext(this.ctx, () => source[step]() as ReturnType<Source[Step]>)
      : (source[step]() as ReturnType<Source[Step]>)
  }

  failed(error: unknown): void {
    // Nobody is there to miss the rest, and a source that listens to
    // `ctx.signal` usually fails because of it.
    if (!this.ctx.signal.aborted) {
      this.host.report(error, this.ctx)
    }
  }

  closeFailed(error: unknown): void {
    if ((error as Error | null)?.name !== 'AbortError') {
      this.host.report(error, this.ctx)
    }
  }
}

/**
 * Closes the bodies of a request, the last first, waiting for them no longer
 * than `CLOSE_TIMEOUT_MS`.
 * @internal
 */
export async function closeBodies(bodies: ManagedBody[]): Promise<void> {
  // A later body may wrap an earlier one, and then closes it itself.
  const closing = bodies.reverse().map((body) => body.close())
  await settledWithin(Promise.all(closing), CLOSE_TIMEOUT_MS)
}
