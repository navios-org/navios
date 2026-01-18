import { Container, Injectable, Registry } from '@navios/di'
import { act, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ContainerProvider } from '../../providers/container-provider.mjs'
import { useInvalidateInstance } from '../use-invalidate.mjs'
import { useService } from '../use-service.mjs'

describe('useInvalidateInstance', () => {
  let container: Container
  let registry: Registry

  beforeEach(() => {
    registry = new Registry()
    container = new Container(registry)
  })

  afterEach(async () => {
    await container.dispose()
    vi.clearAllMocks()
  })

  const createWrapper = (children: React.ReactNode) =>
    createElement(ContainerProvider, { container, children })

  it('should invalidate a service instance directly', async () => {
    let instanceCount = 0

    @Injectable({ registry })
    class CounterService {
      public readonly id: number

      constructor() {
        instanceCount++
        this.id = instanceCount
      }
    }

    let invalidateInstanceFn: ((instance: unknown) => Promise<void>) | null = null
    let currentInstance: CounterService | undefined

    function TestComponent() {
      const { data, isSuccess } = useService(CounterService)
      const invalidateInstance = useInvalidateInstance()
      invalidateInstanceFn = invalidateInstance
      currentInstance = data

      if (!isSuccess) {
        return createElement('div', { 'data-testid': 'loading' }, 'Loading...')
      }

      return createElement('div', { 'data-testid': 'counter' }, String(data!.id))
    }

    render(createWrapper(createElement(TestComponent)))

    await waitFor(() => {
      expect(screen.getByTestId('counter')).toBeDefined()
    })

    expect(screen.getByTestId('counter').textContent).toBe('1')

    // Invalidate the instance directly
    await act(async () => {
      await invalidateInstanceFn!(currentInstance!)
    })

    // Wait for re-fetch
    await waitFor(() => {
      expect(screen.getByTestId('counter').textContent).toBe('2')
    })
  })
})
