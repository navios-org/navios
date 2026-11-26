import { containerDisposed } from '../errors/create.mjs'

import type { DIError } from '../errors/di-error.mjs'

import type { Host } from './host.mjs'

// Whether `host`, or the root container it belongs to, is being or has been disposed.
export function isDisposed(host: Host): boolean {
  return host.disposed || host.root.disposed
}

// The error for using `host` once it is disposed. It names the scope when the
// scope itself is disposed, and the root container otherwise.
export function disposedError(host: Host): DIError {
  return containerDisposed(host.disposed && host.isScope ? 'ScopedContainer' : 'Container')
}

/** Throws when nothing may be built in `host` any more. */
export function assertLive(host: Host): void {
  if (isDisposed(host)) {
    throw disposedError(host)
  }
}
