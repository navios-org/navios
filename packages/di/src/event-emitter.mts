/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */

import { Injectable } from './decorators/index.mjs'
import { InjectableScope } from './enums/index.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type EventsConfig = {
  [event: string]: any[]
}
export type EventsNames<Events extends EventsConfig> = Exclude<
  keyof Events,
  symbol | number
>
export type EventsArgs<
  Events extends EventsConfig,
  Name extends EventsNames<Events>,
> = Events[Name] extends any[] ? Events[Name] : []

@Injectable({ scope: InjectableScope.Transient })
export class EventEmitter<Events extends EventsConfig = {}> {
  private listeners: Map<EventsNames<Events>, Set<Function>> = new Map()

  on<E extends EventsNames<Events>, Args extends EventsArgs<Events, E>>(
    event: E,
    listener: (...args: Args) => void | Promise<void>,
  ) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }

    this.listeners.get(event)!.add(listener)

    return () => {
      this.off(event, listener)
    }
  }

  off<E extends EventsNames<Events>, Args extends EventsArgs<Events, E>>(
    event: E,
    listener: (...args: Args) => void | Promise<void>,
  ) {
    if (!this.listeners.has(event)) {
      return
    }

    this.listeners.get(event)!.delete(listener)
    if (this.listeners.get(event)!.size === 0) {
      this.listeners.delete(event)
    }
  }

  once<E extends EventsNames<Events>, Args extends EventsArgs<Events, E>>(
    event: E,
    listener: (...args: Args) => void | Promise<void>,
  ) {
    const off = this.on(event, (...args) => {
      off()
      // @ts-expect-error - This is a valid call
      listener(...args)
    })

    return off
  }

  async emit<E extends EventsNames<Events>, Args extends EventsArgs<Events, E>>(
    event: E,
    ...args: Args
  ): Promise<any> {
    if (!this.listeners.has(event)) {
      return
    }

    return Promise.all(
      Array.from(this.listeners.get(event)!).map((listener) =>
        listener(...args),
      ),
    )
  }
}
