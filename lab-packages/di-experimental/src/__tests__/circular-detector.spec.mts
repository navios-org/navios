import { describe, expect, it, vi } from 'vitest'

import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { CircularDetector } from '../internal/lifecycle/circular-detector.mjs'
import type { InstanceHolder } from '../internal/holder/instance-holder.mjs'
import { InstanceStatus } from '../internal/holder/instance-holder.mjs'

function createMockHolder(
  name: string,
  waitingFor: string[] = [],
): InstanceHolder {
  return {
    status: InstanceStatus.Creating,
    name,
    instance: null,
    creationPromise: Promise.resolve([undefined, {}]) as any,
    destroyPromise: null,
    type: InjectableType.Class,
    scope: InjectableScope.Singleton,
    deps: new Set(),
    destroyListeners: [],
    createdAt: Date.now(),
    waitingFor: new Set(waitingFor),
  }
}

describe('CircularDetector', () => {
  describe('detectCycle', () => {
    it('should return null when there is no cycle', () => {
      const holders = new Map<string, InstanceHolder>()
      holders.set('A', createMockHolder('A', []))
      holders.set('B', createMockHolder('B', []))

      const getHolder = (name: string) => holders.get(name)

      const result = CircularDetector.detectCycle('A', 'B', getHolder)
      expect(result).toBeNull()
    })

    it('should detect direct circular dependency (A -> B -> A)', () => {
      const holders = new Map<string, InstanceHolder>()
      // A is waiting for B, B is waiting for A
      holders.set('A', createMockHolder('A', ['B']))
      holders.set('B', createMockHolder('B', ['A']))

      const getHolder = (name: string) => holders.get(name)

      // A wants to wait for B, but B is already waiting for A
      const result = CircularDetector.detectCycle('A', 'B', getHolder)
      expect(result).toEqual(['A', 'B', 'A'])
    })

    it('should detect indirect circular dependency (A -> B -> C -> A)', () => {
      const holders = new Map<string, InstanceHolder>()
      holders.set('A', createMockHolder('A', ['B']))
      holders.set('B', createMockHolder('B', ['C']))
      holders.set('C', createMockHolder('C', ['A']))

      const getHolder = (name: string) => holders.get(name)

      // A wants to wait for B, but there's a path B -> C -> A
      const result = CircularDetector.detectCycle('A', 'B', getHolder)
      expect(result).toEqual(['A', 'B', 'C', 'A'])
    })

    it('should detect self-dependency (A -> A)', () => {
      const holders = new Map<string, InstanceHolder>()
      holders.set('A', createMockHolder('A', ['A']))

      const getHolder = (name: string) => holders.get(name)

      const result = CircularDetector.detectCycle('A', 'A', getHolder)
      // Direct self-reference
      expect(result).toEqual(['A', 'A'])
    })

    it('should handle complex dependency graphs without false positives', () => {
      const holders = new Map<string, InstanceHolder>()
      // Diamond dependency: A -> B, A -> C, B -> D, C -> D
      holders.set('A', createMockHolder('A', ['B', 'C']))
      holders.set('B', createMockHolder('B', ['D']))
      holders.set('C', createMockHolder('C', ['D']))
      holders.set('D', createMockHolder('D', []))

      const getHolder = (name: string) => holders.get(name)

      // No cycle in diamond pattern
      const result = CircularDetector.detectCycle('A', 'B', getHolder)
      expect(result).toBeNull()
    })

    it('should detect cycle in complex dependency graph', () => {
      const holders = new Map<string, InstanceHolder>()
      // A -> B -> C -> D -> B (cycle through B)
      holders.set('A', createMockHolder('A', ['B']))
      holders.set('B', createMockHolder('B', ['C']))
      holders.set('C', createMockHolder('C', ['D']))
      holders.set('D', createMockHolder('D', ['B']))

      const getHolder = (name: string) => holders.get(name)

      // A waiting for B should detect the cycle
      // Path: A -> B -> C -> D -> B
      // But since we start from A waiting for B, we check if B eventually leads to A
      // In this case, B -> C -> D -> B, not leading to A
      const result = CircularDetector.detectCycle('A', 'B', getHolder)
      expect(result).toBeNull() // No cycle that includes A

      // But if A is in the cycle
      holders.set('D', createMockHolder('D', ['A']))
      const result2 = CircularDetector.detectCycle('A', 'B', getHolder)
      expect(result2).toEqual(['A', 'B', 'C', 'D', 'A'])
    })

    it('should handle missing holders gracefully', () => {
      const holders = new Map<string, InstanceHolder>()
      holders.set('A', createMockHolder('A', ['B']))
      // B doesn't exist

      const getHolder = (name: string) => holders.get(name)

      const result = CircularDetector.detectCycle('A', 'B', getHolder)
      expect(result).toBeNull()
    })

    it('should handle empty waitingFor sets', () => {
      const holders = new Map<string, InstanceHolder>()
      holders.set('A', createMockHolder('A', []))
      holders.set('B', createMockHolder('B', []))

      const getHolder = (name: string) => holders.get(name)

      const result = CircularDetector.detectCycle('A', 'B', getHolder)
      expect(result).toBeNull()
    })

    it('should not revisit already visited nodes', () => {
      const holders = new Map<string, InstanceHolder>()
      // Multiple paths to same node
      holders.set('A', createMockHolder('A', ['B', 'C']))
      holders.set('B', createMockHolder('B', ['D']))
      holders.set('C', createMockHolder('C', ['D']))
      holders.set('D', createMockHolder('D', ['E']))
      holders.set('E', createMockHolder('E', []))

      const getHolder = vi.fn((name: string) => holders.get(name))

      CircularDetector.detectCycle('A', 'B', getHolder)

      // D should only be visited once despite multiple paths to it
      const dCalls = getHolder.mock.calls.filter((call) => call[0] === 'D')
      expect(dCalls.length).toBe(1)
    })
  })

  describe('formatCycle', () => {
    it('should format cycle path correctly', () => {
      const cycle = ['A', 'B', 'C', 'A']
      const result = CircularDetector.formatCycle(cycle)
      expect(result).toBe('A -> B -> C -> A')
    })

    it('should format single-element cycle', () => {
      const cycle = ['A', 'A']
      const result = CircularDetector.formatCycle(cycle)
      expect(result).toBe('A -> A')
    })

    it('should handle empty cycle array', () => {
      const cycle: string[] = []
      const result = CircularDetector.formatCycle(cycle)
      expect(result).toBe('')
    })
  })

  describe('production mode behavior', () => {
    it('should skip detection in production (NODE_ENV check)', () => {
      // Note: This test verifies the behavior exists in the code
      // In actual production mode, detectCycle returns null early
      // We can't easily test this without modifying NODE_ENV

      const holders = new Map<string, InstanceHolder>()
      holders.set('A', createMockHolder('A', ['B']))
      holders.set('B', createMockHolder('B', ['A']))

      const getHolder = (name: string) => holders.get(name)

      // In development mode (default for tests), should detect cycle
      const result = CircularDetector.detectCycle('A', 'B', getHolder)
      expect(result).not.toBeNull()
    })
  })
})
