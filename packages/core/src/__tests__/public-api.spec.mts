import { describe, expect, it } from 'vitest'

import * as main from '../index.mjs'
import * as legacy from '../legacy-compat/index.mjs'
import * as testing from '../testing/index.mjs'
import * as transport from '../transport.mjs'

// What an entry exports is a promise: adding to a list here is a decision, not
// a side effect of an export somewhere else.
describe('the exports of', () => {
  it('@navios/core', () => {
    expect(Object.keys(main).sort()).toEqual(
      [
        // @navios/di
        'asyncInject',
        'BoundInjectionToken',
        'Container',
        'DIError',
        'DIErrorCode',
        'Factory',
        'FactoryInjectionToken',
        'getInjectableToken',
        'inject',
        'Injectable',
        'InjectableScope',
        'InjectionToken',
        'optional',
        'provide',
        'registerFactory',
        'registerInjectable',
        'registerProvider',
        'ScopedContainer',
        // application
        'Application',
        'createApplication',
        'definePlugin',
        'Module',
        'registerModule',
        'UseGuards',
        'UseInterceptors',
        'AttributeFactory',
        // contexts
        'createContextKey',
        'currentContext',
        'ExecutionContextToken',
        'PlainContextKey',
        // configuration
        'ConfigService',
        'EnvConfigProvider',
        'envInt',
        'envString',
        'provideConfig',
        // logging
        'ConsoleLogger',
        'filterLogLevels',
        'LOG_LEVELS',
        'Logger',
        'LoggerInstance',
        'LoggerOutput',
      ].sort(),
    )
  })

  it('@navios/core/transport', () => {
    expect(Object.keys(transport).sort()).toEqual(
      [
        'BasicExecutionContext',
        'buildModuleGraph',
        'classMetadata',
        'constructedInstances',
        'defineTransport',
        'describeHandlerClass',
        'disposeScope',
        'executeChain',
        'getModuleMetadata',
        'handlerChain',
        'MAX_DELAY_MS',
        'memberMetadata',
        'moduleClasses',
        'needsScope',
        'ownMetadata',
        'requireMetadata',
        'resolveChain',
        'runChain',
        'runInContext',
        'settledWithin',
      ].sort(),
    )
  })

  it('@navios/core/testing', () => {
    expect(Object.keys(testing).sort()).toEqual([
      'createContextHost',
      'enableAsyncContext',
      'fakeTransport',
    ])
  })

  it('@navios/core/legacy-compat', () => {
    expect(Object.keys(legacy).sort()).toEqual(
      [
        'AttributeFactory',
        'createClassContext',
        'createMethodContext',
        'Factory',
        'Injectable',
        'legacy',
        'Module',
        'UseGuards',
        'UseInterceptors',
      ].sort(),
    )
  })
})
