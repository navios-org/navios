import { Container, Injectable, InjectionToken } from '@navios/di'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ScopedContainer } from '@navios/di'

import { HttpException } from '../exceptions/index.mjs'
import { LoggerOutput } from '../logger/logger.tokens.mjs'
import {
  ForbiddenResponderToken,
  InternalServerErrorResponderToken,
  NotFoundResponderToken,
  ValidationErrorResponderToken,
} from '../responders/tokens/responder.tokens.mjs'
import { GuardRunnerService } from '../services/guard-runner.service.mjs'

import type { AbstractExecutionContext, CanActivate } from '../interfaces/index.mjs'
import type { ControllerMetadata, HandlerMetadata, ModuleMetadata } from '../metadata/index.mjs'

// Mock responders
const createMockResponder = (statusCode: number, message: string) => ({
  getResponse: vi.fn().mockReturnValue({
    statusCode,
    payload: { message },
    headers: { 'content-type': 'application/problem+json' },
  }),
})

// Mock logger output
const mockLoggerOutput = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
  fatal: vi.fn(),
}

// Mock execution context
const createMockExecutionContext = (): AbstractExecutionContext => {
  const mockReply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  }
  return {
    getRequest: vi.fn().mockReturnValue({}),
    getReply: vi.fn().mockReturnValue(mockReply),
    getHandler: vi.fn(),
    getModule: vi.fn(),
    getController: vi.fn(),
  }
}

// Mock guard
const createMockGuard = (canActivateResult: boolean | Promise<boolean>): CanActivate => ({
  canActivate: vi.fn().mockImplementation(() => canActivateResult),
})

describe('GuardRunnerService', () => {
  let container: Container
  let mockForbiddenResponder: ReturnType<typeof createMockResponder>
  let mockInternalErrorResponder: ReturnType<typeof createMockResponder>
  let mockNotFoundResponder: ReturnType<typeof createMockResponder>
  let mockValidationErrorResponder: ReturnType<typeof createMockResponder>

  beforeEach(() => {
    container = new Container()
    vi.clearAllMocks()

    // Create mock responders
    mockForbiddenResponder = createMockResponder(403, 'Forbidden')
    mockInternalErrorResponder = createMockResponder(500, 'Internal Server Error')
    mockNotFoundResponder = createMockResponder(404, 'Not Found')
    mockValidationErrorResponder = createMockResponder(400, 'Validation Error')

    // Register all required dependencies
    container.addInstance(ForbiddenResponderToken, mockForbiddenResponder)
    container.addInstance(InternalServerErrorResponderToken, mockInternalErrorResponder)
    container.addInstance(NotFoundResponderToken, mockNotFoundResponder)
    container.addInstance(ValidationErrorResponderToken, mockValidationErrorResponder)
    container.addInstance(LoggerOutput, mockLoggerOutput)
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('runGuardsStatic', () => {
    it('should return true when all guards pass', async () => {
      const service = await container.get(GuardRunnerService)
      const guards = [createMockGuard(true), createMockGuard(true)]
      const context = createMockExecutionContext()

      const result = await service.runGuardsStatic(guards, context)

      expect(result).toBe(true)
      expect(guards[0].canActivate).toHaveBeenCalledWith(context)
      expect(guards[1].canActivate).toHaveBeenCalledWith(context)
    })

    it('should return false when a guard returns false', async () => {
      const service = await container.get(GuardRunnerService)
      const guards = [createMockGuard(true), createMockGuard(false)]
      const context = createMockExecutionContext()

      const result = await service.runGuardsStatic(guards, context)

      expect(result).toBe(false)
      expect(context.getReply().status).toHaveBeenCalledWith(403)
    })

    it('should stop execution when a guard fails', async () => {
      const service = await container.get(GuardRunnerService)
      const firstGuard = createMockGuard(false)
      const secondGuard = createMockGuard(true)
      const guards = [firstGuard, secondGuard]
      const context = createMockExecutionContext()

      await service.runGuardsStatic(guards, context)

      expect(firstGuard.canActivate).toHaveBeenCalled()
      expect(secondGuard.canActivate).not.toHaveBeenCalled()
    })

    it('should handle HttpException from guard', async () => {
      const service = await container.get(GuardRunnerService)
      const httpException = new HttpException(401, 'Unauthorized')
      const guard = {
        canActivate: vi.fn().mockRejectedValue(httpException),
      }
      const context = createMockExecutionContext()

      const result = await service.runGuardsStatic([guard], context)

      expect(result).toBe(false)
      expect(context.getReply().status).toHaveBeenCalledWith(401)
      expect(context.getReply().send).toHaveBeenCalledWith('Unauthorized')
    })

    it('should handle unknown errors from guard', async () => {
      const service = await container.get(GuardRunnerService)
      const guard = {
        canActivate: vi.fn().mockRejectedValue(new Error('Unknown error')),
      }
      const context = createMockExecutionContext()

      const result = await service.runGuardsStatic([guard], context)

      expect(result).toBe(false)
      expect(mockLoggerOutput.error).toHaveBeenCalled()
      expect(context.getReply().status).toHaveBeenCalledWith(500)
    })

    it('should handle async guards', async () => {
      const service = await container.get(GuardRunnerService)
      const asyncGuard = createMockGuard(Promise.resolve(true))
      const context = createMockExecutionContext()

      const result = await service.runGuardsStatic([asyncGuard], context)

      expect(result).toBe(true)
    })

    it('should work with empty guard array', async () => {
      const service = await container.get(GuardRunnerService)
      const context = createMockExecutionContext()

      const result = await service.runGuardsStatic([], context)

      expect(result).toBe(true)
    })
  })

  describe('runGuards', () => {
    it('should resolve guards from scoped container', async () => {
      @Injectable()
      class TestGuard implements CanActivate {
        canActivate = vi.fn().mockReturnValue(true)
      }

      const service = await container.get(GuardRunnerService)
      const testGuardInstance = new TestGuard()

      const mockScopedContainer = {
        get: vi.fn().mockResolvedValue(testGuardInstance),
      } as unknown as ScopedContainer

      const guards = new Set([TestGuard])
      const context = createMockExecutionContext()

      const result = await service.runGuards(guards, context, mockScopedContainer)

      expect(result).toBe(true)
      expect(mockScopedContainer.get).toHaveBeenCalled()
      expect(testGuardInstance.canActivate).toHaveBeenCalledWith(context)
    })

    it('should throw error for guard without canActivate', async () => {
      @Injectable()
      class InvalidGuard {
        // Missing canActivate
      }

      const service = await container.get(GuardRunnerService)
      const mockScopedContainer = {
        get: vi.fn().mockResolvedValue(new InvalidGuard()),
      } as unknown as ScopedContainer

      const guards = new Set([InvalidGuard as any])
      const context = createMockExecutionContext()

      await expect(service.runGuards(guards, context, mockScopedContainer)).rejects.toThrow(
        'does not implement canActivate',
      )
    })

    it('should reverse guard order (module -> controller -> endpoint)', async () => {
      const callOrder: string[] = []

      @Injectable()
      class Guard1 implements CanActivate {
        canActivate() {
          callOrder.push('guard1')
          return true
        }
      }

      @Injectable()
      class Guard2 implements CanActivate {
        canActivate() {
          callOrder.push('guard2')
          return true
        }
      }

      @Injectable()
      class Guard3 implements CanActivate {
        canActivate() {
          callOrder.push('guard3')
          return true
        }
      }

      const service = await container.get(GuardRunnerService)

      const mockScopedContainer = {
        get: vi.fn().mockImplementation((token) => {
          if (token === Guard1) return new Guard1()
          if (token === Guard2) return new Guard2()
          if (token === Guard3) return new Guard3()
        }),
      } as unknown as ScopedContainer

      // Order in Set: Guard1, Guard2, Guard3
      // Should execute in reverse: Guard3, Guard2, Guard1
      const guards = new Set([Guard1, Guard2, Guard3])
      const context = createMockExecutionContext()

      await service.runGuards(guards, context, mockScopedContainer)

      expect(callOrder).toEqual(['guard3', 'guard2', 'guard1'])
    })
  })

  describe('makeContext', () => {
    it('should merge guards from module, controller, and endpoint', async () => {
      const service = await container.get(GuardRunnerService)

      class ModuleGuard {}
      class ControllerGuard {}
      class EndpointGuard {}

      const moduleMetadata = {
        guards: new Set([ModuleGuard]),
      } as unknown as ModuleMetadata

      const controllerMetadata = {
        guards: new Set([ControllerGuard]),
      } as unknown as ControllerMetadata

      const endpointMetadata = {
        guards: new Set([EndpointGuard]),
      } as unknown as HandlerMetadata<any>

      const result = service.makeContext(moduleMetadata, controllerMetadata, endpointMetadata)

      expect(result.size).toBe(3)
      expect(result.has(ModuleGuard as any)).toBe(true)
      expect(result.has(ControllerGuard as any)).toBe(true)
      expect(result.has(EndpointGuard as any)).toBe(true)
    })

    it('should handle empty guards at each level', async () => {
      const service = await container.get(GuardRunnerService)

      const moduleMetadata = {
        guards: new Set(),
      } as unknown as ModuleMetadata

      const controllerMetadata = {
        guards: new Set(),
      } as unknown as ControllerMetadata

      const endpointMetadata = {
        guards: new Set(),
      } as unknown as HandlerMetadata<any>

      const result = service.makeContext(moduleMetadata, controllerMetadata, endpointMetadata)

      expect(result.size).toBe(0)
    })

    it('should deduplicate guards', async () => {
      const service = await container.get(GuardRunnerService)

      class SharedGuard {}

      const moduleMetadata = {
        guards: new Set([SharedGuard]),
      } as unknown as ModuleMetadata

      const controllerMetadata = {
        guards: new Set([SharedGuard]), // Same guard
      } as unknown as ControllerMetadata

      const endpointMetadata = {
        guards: new Set([SharedGuard]), // Same guard
      } as unknown as HandlerMetadata<any>

      const result = service.makeContext(moduleMetadata, controllerMetadata, endpointMetadata)

      // Set deduplicates automatically
      expect(result.size).toBe(1)
    })

    it('should handle injection tokens as guards', async () => {
      const service = await container.get(GuardRunnerService)

      const GuardToken = InjectionToken.create<CanActivate>(Symbol.for('GuardToken'))

      const moduleMetadata = {
        guards: new Set([GuardToken]),
      } as unknown as ModuleMetadata

      const controllerMetadata = {
        guards: new Set(),
      } as unknown as ControllerMetadata

      const endpointMetadata = {
        guards: new Set(),
      } as unknown as HandlerMetadata<any>

      const result = service.makeContext(moduleMetadata, controllerMetadata, endpointMetadata)

      expect(result.size).toBe(1)
      expect(result.has(GuardToken)).toBe(true)
    })
  })
})
