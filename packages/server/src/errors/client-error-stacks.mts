/**
 * Whether the errors that are answered with a 4xx status capture a stack.
 * `'development'` captures unless `NODE_ENV` is `production`.
 */
export type ClientErrorStacks = 'always' | 'development' | 'never'

function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production'
}

// An error is constructed by application code that does not know which
// application will answer it, so the choice cannot be looked up per
// application. While several run in one process, one that wants stacks gets
// them for all.
let running = 0
let wanting = 0

/**
 * Applies an application's choice until the returned function is called.
 * @internal
 */
export function useClientErrorStacks(mode: ClientErrorStacks): () => void {
  const wants = mode === 'always' || (mode === 'development' && isDevelopment())
  running++
  if (wants) {
    wanting++
  }
  let active = true
  return () => {
    if (active) {
      active = false
      running--
      if (wants) {
        wanting--
      }
    }
  }
}

// Under frozen intrinsics the limit cannot be changed.
const adjustable = Object.getOwnPropertyDescriptor(Error, 'stackTraceLimit')?.writable === true

/**
 * Stops stack capture for a client error about to be constructed. Returns
 * what `resumeStacks()` needs, or `undefined` when its stack is wanted.
 * @internal
 */
export function suspendStacks(): number | undefined {
  if (!adjustable || (running === 0 ? isDevelopment() : wanting > 0)) {
    return undefined
  }
  const limit = Error.stackTraceLimit
  Error.stackTraceLimit = 0
  return limit
}

/** @internal */
export function resumeStacks(limit: number | undefined): void {
  if (limit !== undefined) {
    Error.stackTraceLimit = limit
  }
}
