import { AttributeFactory } from '../attributes/attribute-factory.mjs'

import type { NaviosApplication } from '../application/navios-application.mjs'
import type { ClassAttribute } from '../attributes/attribute-factory.mjs'

import { s } from './schema.mjs'

import type { ConformanceOptions, ConformanceRunner } from './conformance-options.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What the topics of the conformance suite share: the runner, the application
 * under test and the helpers to call it.
 * @internal
 */
export interface ConformanceSuite {
  readonly options: ConformanceOptions
  readonly it: ConformanceRunner['it']
  readonly expect: ConformanceRunner['expect']
  /** The application under test. Set before the first test runs. */
  app: NaviosApplication<any>
  /** The address the application listens on. Set before the first test runs. */
  base: string
  /** What handlers, guards and request values record, for a test to check. */
  readonly events: string[]
  /** Marks a controller as open to requests without an authorization header. */
  readonly Public: ClassAttribute
  /** The URL of a path under the `/api` prefix of the application. */
  url(path: string): string
  /** `fetch` options for a POST with a JSON body. */
  json(
    body: unknown,
    headers?: Record<string, string>,
  ): { method: string; headers: Record<string, string>; body: string }
  /** Waits, for at most a second, until `predicate` holds. */
  waitFor(predicate: () => boolean): Promise<void>
  pause(ms: number): Promise<void>
}

/** @internal */
export function createSuite(options: ConformanceOptions): ConformanceSuite {
  const suite: ConformanceSuite = {
    options,
    it: options.runner.it,
    expect: options.runner.expect,
    app: undefined as unknown as NaviosApplication<any>,
    base: '',
    events: [],
    Public: AttributeFactory.createAttribute(Symbol.for('navios.conformance.Public')),
    url: (path) => `${suite.base}/api${path}`,
    json: (body, headers = {}) => ({
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    waitFor: async (predicate) => {
      for (let i = 0; i < 200 && !predicate(); i++) {
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
    },
    pause: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  }
  return suite
}

/**
 * A builder-like endpoint declaration, so that the suite needs no builder.
 * @internal
 */
export const endpoint = <Config extends Record<string, unknown>>(config: Config) =>
  ({ config }) as any

/** @internal */
export const user = s.object({ id: s.string(), name: s.string() })
