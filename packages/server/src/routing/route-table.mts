import { isUnmatchable } from './route-path.mjs'

import type { RoutePath, RouteSegment } from './route-path.mjs'

interface Entry<T> {
  method: string
  segments: readonly RouteSegment[]
  value: T
}

/** The routes of one number of segments, by their first segment's text. */
interface Group<T> {
  fixed: Map<string, Entry<T>[]>
  open: Entry<T>[]
}

export interface RouteMatch<T> {
  readonly value: T
  readonly urlParams: Record<string, string>
}

/**
 * Matches the path of a request to a route the way the adapters' routers do:
 * at the first segment where two routes differ, fixed text wins over a url
 * param, and a url param over a rest param. A path with a segment that is
 * empty or a dot segment matches no url param and no rest param. Adapters
 * whose server has no router of its own use it.
 */
export class RouteTable<T> {
  private readonly bySize = new Map<number, Group<T>>()
  /** Routes that end in a rest param, by the text of their first segment. */
  private readonly restFixed = new Map<string, Entry<T>[]>()
  /** Routes that end in a rest param and start with one, or with a url param. */
  private readonly restOpen: Entry<T>[] = []

  constructor(private readonly decode: (segment: string) => string = decodeURIComponent) {}

  add(method: string, { segments }: RoutePath, value: T): void {
    const entry = { method, segments, value }
    const [first] = segments
    if ('rest' in segments[segments.length - 1]) {
      if ('literal' in first) {
        const entries = this.restFixed.get(first.literal)
        if (entries === undefined) {
          this.restFixed.set(first.literal, [entry])
        } else {
          entries.push(entry)
        }
      } else {
        this.restOpen.push(entry)
      }
      return
    }
    let group = this.bySize.get(segments.length)
    if (group === undefined) {
      group = { fixed: new Map(), open: [] }
      this.bySize.set(segments.length, group)
    }
    if (!('literal' in first)) {
      group.open.push(entry)
      return
    }
    const entries = group.fixed.get(first.literal)
    if (entries === undefined) {
      group.fixed.set(first.literal, [entry])
    } else {
      entries.push(entry)
    }
  }

  match(method: string, path: string): RouteMatch<T> | undefined {
    const { texts, entries } = this.matching(path)
    return (
      closest(entries, method, texts) ??
      (method === 'HEAD' ? closest(entries, 'GET', texts) : undefined)
    )
  }

  methods(path: string): string[] {
    const { entries } = this.matching(path)
    if (entries.length === 0) {
      return []
    }
    const methods = new Set(entries.map((entry) => entry.method))
    if (methods.has('GET')) {
      methods.add('HEAD')
    }
    return [...methods].sort()
  }

  /** The routes that end in a rest param and may match a path of these segments. */
  private restFor(raw: readonly string[]): Entry<T>[] | undefined {
    if (this.restFixed.size === 0) {
      return undefined
    }
    let first = raw[0]
    if (first.includes('%')) {
      try {
        first = this.decode(first)
      } catch {
        // No route has fixed text that is not valid percent-encoding.
        return undefined
      }
    }
    return this.restFixed.get(first)
  }

  private matching(path: string): { texts: string[]; entries: Entry<T>[] } {
    if (!path.startsWith('/')) {
      return { texts: [], entries: [] }
    }
    const raw = path.slice(1).split('/')
    const group = this.bySize.get(raw.length)
    const restFixed = this.restFor(raw)
    const { restOpen } = this
    // Decoded only for the routes that may match, so that a path nothing can
    // match is not refused for its percent-encoding.
    if (group === undefined && restFixed === undefined && restOpen.length === 0) {
      return { texts: raw, entries: [] }
    }
    const texts = path.includes('%') ? raw.map(this.decode) : raw
    const entries: Entry<T>[] = []
    if (group !== undefined) {
      for (const candidates of [group.fixed.get(texts[0]), group.open]) {
        for (const entry of candidates ?? []) {
          if (matches(entry, texts, entry.segments.length)) {
            entries.push(entry)
          }
        }
      }
    }
    for (const candidates of [restFixed, restOpen]) {
      for (const entry of candidates ?? []) {
        if (matchesRest(entry, texts)) {
          entries.push(entry)
        }
      }
    }
    return { texts, entries }
  }
}

/** Whether the first `count` segments of a route match those of a path. */
function matches({ segments }: Entry<unknown>, texts: readonly string[], count: number): boolean {
  for (let i = 0; i < count; i++) {
    const segment = segments[i]
    if ('literal' in segment ? segment.literal !== texts[i] : isUnmatchable(texts[i])) {
      return false
    }
  }
  return true
}

/** Whether a route that ends in a rest param matches: one segment or more for the rest. */
function matchesRest(entry: Entry<unknown>, texts: readonly string[]): boolean {
  const last = entry.segments.length - 1
  if (texts.length <= last || !matches(entry, texts, last)) {
    return false
  }
  for (let i = last; i < texts.length; i++) {
    if (isUnmatchable(texts[i])) {
      return false
    }
  }
  return true
}

function closest<T>(
  entries: Entry<T>[],
  method: string,
  texts: string[],
): RouteMatch<T> | undefined {
  let found: Entry<T> | undefined
  for (const entry of entries) {
    if (entry.method === method && (found === undefined || isCloser(entry, found))) {
      found = entry
    }
  }
  if (found === undefined) {
    return undefined
  }
  const urlParams: Record<string, string> = {}
  found.segments.forEach((segment, index) => {
    if ('param' in segment) {
      urlParams[segment.param] = texts[index]
    } else if ('rest' in segment) {
      urlParams[segment.rest] = texts.slice(index).join('/')
    }
  })
  return { value: found.value, urlParams }
}

/** Fixed text before a url param, a url param before a rest param. */
function rank(segment: RouteSegment): number {
  return 'literal' in segment ? 2 : 'param' in segment ? 1 : 0
}

function isCloser(entry: Entry<unknown>, other: Entry<unknown>): boolean {
  const length = Math.min(entry.segments.length, other.segments.length)
  for (let at = 0; at < length; at++) {
    const difference = rank(entry.segments[at]) - rank(other.segments[at])
    if (difference !== 0) {
      return difference > 0
    }
  }
  return false
}
