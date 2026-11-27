import { outsideSteps } from './lifecycle-step.mjs'

interface Closable {
  close(signal?: string): Promise<void>
}

export interface ShutdownHooksOptions {
  /**
   * Whether the signal ends the process once every application has closed,
   * as it would have without a listener. It does not when something else in
   * the process listens to the signal.
   * @default true
   */
  exit?: boolean
}

interface Registration {
  exit: boolean
  onError(signal: string, error: unknown): void
}

/** Every application that one signal closes, until it is closed. */
interface SignalRegistry {
  readonly applications: Map<Closable, Registration>
  readonly listener: () => void
}

const registries = new Map<NodeJS.Signals, SignalRegistry>()

/** Closes `application` when the process receives one of the signals. */
export function closeOnSignals(
  application: Closable,
  signals: readonly NodeJS.Signals[],
  registration: Registration,
): void {
  for (const signal of signals) {
    let registry = registries.get(signal)
    if (registry === undefined) {
      const created: SignalRegistry = {
        applications: new Map(),
        listener: () => void receive(signal, created),
      }
      registry = created
      registries.set(signal, registry)
      process.on(signal, registry.listener)
    }
    registry.applications.set(application, registration)
  }
}

/**
 * Ends what `closeOnSignals` did for an application once it has closed. Until
 * then a signal must not end the process.
 */
export function stopListening(application: Closable, closing: Promise<unknown>): void {
  for (const { applications } of registries.values()) {
    if (applications.has(application)) {
      const forgetIt = () => forget(application)
      closing.then(forgetIt, forgetIt)
      return
    }
  }
}

function forget(application: Closable): void {
  for (const [signal, registry] of registries) {
    if (registry.applications.delete(application) && registry.applications.size === 0) {
      remove(signal, registry)
    }
  }
}

function remove(signal: NodeJS.Signals, registry: SignalRegistry): void {
  registries.delete(signal)
  process.off(signal, registry.listener)
}

async function receive(signal: NodeJS.Signals, registry: SignalRegistry): Promise<void> {
  // From here on signals do what they do by default: a second one ends the
  // process at once.
  remove(signal, registry)
  const applications = [...registry.applications]
  await Promise.all(
    applications.map(async ([application, { onError }]) => {
      forget(application)
      try {
        // A listener runs in the async context it was installed in, which may
        // be a hook that the shutdown has to wait for.
        await outsideSteps(() => application.close(signal))
      } catch (error) {
        onError(signal, error)
      }
    }),
  )
  const exit = applications.every(([, registration]) => registration.exit)
  if (exit && process.listenerCount(signal) === 0) {
    endProcess(signal)
  }
}

/**
 * The numbers that are the same on every platform, for a runtime that has no
 * `node:os` to ask.
 */
const SIGNAL_NUMBERS: Partial<Record<NodeJS.Signals, number>> = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGABRT: 6,
  SIGKILL: 9,
  SIGALRM: 14,
  SIGTERM: 15,
}

/**
 * The number of a signal. `node:os` is asked for when a signal has arrived
 * and not imported: workerd has no such module before the compatibility date
 * 2025-09-15, and a Worker that never gets a signal must still load.
 */
function signalNumber(signal: NodeJS.Signals): number | undefined {
  let numbers: Partial<Record<string, number>> | undefined
  try {
    numbers = process.getBuiltinModule?.('node:os')?.constants.signals
  } catch {
    // The runtime does not have it.
  }
  return numbers?.[signal] ?? SIGNAL_NUMBERS[signal]
}

function endProcess(signal: NodeJS.Signals): void {
  if (process.pid === 1) {
    // The first process of a container gets no signal that it does not handle.
    const number = signalNumber(signal)
    process.exit(number === undefined ? 1 : 128 + number)
  } else {
    process.kill(process.pid, signal)
  }
}
