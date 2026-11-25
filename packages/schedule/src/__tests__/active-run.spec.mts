import { describe, expect, it, vi } from 'vitest'

import { currentRun, runAs } from '../jobs/active-run.mjs'

import type { ActiveRun } from '../jobs/active-run.mjs'

import { deferred } from './logger-output.mjs'

function run(job: string): ActiveRun {
  return {
    job,
    controller: new AbortController(),
    ended: Promise.resolve(),
    hasEnded: false,
    abandoned: false,
  }
}

describe('the current run', () => {
  it('should be kept track of only while there is one', async () => {
    const disable = vi.spyOn(currentRun, 'disable')
    const gates = [deferred(), deferred()]
    const seen: unknown[] = []
    const work = (gate: Promise<void>) => async () => {
      await gate.catch(() => {})
      seen.push(currentRun.getStore()?.job)
      await gate
    }

    const first = runAs(run('first'), work(gates[0].promise))
    const second = runAs(run('second'), work(gates[1].promise))
    gates[0].resolve()
    await first
    expect(disable).not.toHaveBeenCalled()
    gates[1].reject(new Error('failed'))
    await expect(second).rejects.toThrow('failed')
    expect(disable).toHaveBeenCalledTimes(1)

    await runAs(run('third'), work(Promise.resolve()))
    expect(disable).toHaveBeenCalledTimes(2)
    expect(seen).toEqual(['first', 'second', 'third'])
  })
})
