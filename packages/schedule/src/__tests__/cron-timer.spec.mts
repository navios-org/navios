import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Schedule } from '../index.mjs'
import { CronTimer } from '../jobs/cron-timer.mjs'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

describe('CronTimer', () => {
  let timer: CronTimer | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime('2021-01-01T00:00:00.000Z')
  })

  afterEach(() => {
    timer?.stop()
    timer = null
    vi.useRealTimers()
  })

  /** The times at which an expression calls back, in `hours` from `from`. */
  function run(expression: string, timeZone: string, from: string, hours: number) {
    vi.setSystemTime(from)
    const times: string[] = []
    timer = new CronTimer(expression, timeZone, (scheduledAt) => {
      expect(Date.now()).toBe(scheduledAt.getTime())
      times.push(scheduledAt.toISOString().replace(':00.000Z', 'Z'))
    })
    timer.start()
    vi.advanceTimersByTime(hours * HOUR)
    timer.stop()
    return times
  }

  it('should not call back before it is started and after it is stopped', () => {
    const onTick = vi.fn()
    timer = new CronTimer('* * * * * *', 'UTC', onTick)
    vi.advanceTimersByTime(3000)
    expect(onTick).not.toHaveBeenCalled()
    expect(timer.next).toBeNull()

    timer.start()
    timer.start()
    expect(timer.next).toEqual(new Date('2021-01-01T00:00:04.000Z'))
    vi.advanceTimersByTime(2000)
    expect(onTick).toHaveBeenCalledTimes(2)

    timer.stop()
    expect(timer.active).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('should reach beyond the longest delay of a timer', () => {
    const onTick = vi.fn()
    timer = new CronTimer('0 0 1 6 *', 'UTC', onTick)
    timer.start()

    vi.advanceTimersByTime(Date.parse('2021-06-01T00:00:00.000Z') - Date.now() - 1)
    expect(onTick).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onTick).toHaveBeenCalledExactlyOnceWith(new Date('2021-06-01T00:00:00.000Z'))
    expect(timer.next).toEqual(new Date('2022-06-01T00:00:00.000Z'))
  })

  it('should run a tick that is late once, and skip those it missed', () => {
    const onTick = vi.fn()
    timer = new CronTimer('* * * * * *', 'UTC', onTick)
    timer.start()

    // The event loop is blocked for 3.5 seconds.
    vi.setSystemTime('2021-01-01T00:00:03.500Z')
    vi.advanceTimersByTime(1000)

    expect(onTick).toHaveBeenCalledExactlyOnceWith(new Date('2021-01-01T00:00:01.000Z'))
    expect(timer.next).toEqual(new Date('2021-01-01T00:00:05.000Z'))
  })

  it('should wait again when the timer fires before the time', () => {
    const onTick = vi.fn()
    timer = new CronTimer('* * * * * *', 'UTC', onTick)
    timer.start()

    // The clock is set back while waiting.
    vi.setSystemTime('2020-12-31T23:59:59.500Z')
    vi.advanceTimersByTime(1000)
    expect(onTick).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(onTick).toHaveBeenCalledExactlyOnceWith(new Date('2021-01-01T00:00:01.000Z'))
  })

  it('should use the time zone of the process by default', () => {
    timer = new CronTimer('0 4 * * *', undefined, () => {})
    timer.start()

    expect(timer.next?.getHours()).toBe(4)
    expect(timer.next?.getMinutes()).toBe(0)
  })

  describe('daylight saving time', () => {
    // Europe/Kyiv: 03:00 becomes 04:00 on 2026-03-29, 04:00 becomes 03:00 on
    // 2026-10-25, both at 01:00 UTC. America/New_York: 02:00 becomes 03:00 on
    // 2026-03-08 at 07:00 UTC, 02:00 becomes 01:00 on 2026-11-01 at 06:00 UTC.
    it.each([
      [
        '30 3 * * *',
        'Europe/Kyiv',
        '2026-03-28T12:00Z',
        ['2026-03-29T01:00Z', '2026-03-30T00:30Z'],
      ],
      ['0 3 * * *', 'Europe/Kyiv', '2026-03-28T12:00Z', ['2026-03-29T01:00Z', '2026-03-30T00:00Z']],
      ['0 4 * * *', 'Europe/Kyiv', '2026-03-28T12:00Z', ['2026-03-29T01:00Z', '2026-03-30T01:00Z']],
      [
        '30 2 * * *',
        'America/New_York',
        '2026-03-07T12:00Z',
        ['2026-03-08T07:00Z', '2026-03-09T06:30Z'],
      ],
    ])(
      'should run %s in %s at the end of the gap in spring',
      (expression, zone, from, expected) => {
        expect(run(expression, zone, from, 48)).toEqual(expected)
      },
    )

    it.each([
      [
        '30 3 * * *',
        'Europe/Kyiv',
        '2026-10-24T12:00Z',
        ['2026-10-25T00:30Z', '2026-10-26T01:30Z'],
      ],
      ['0 4 * * *', 'Europe/Kyiv', '2026-10-24T12:00Z', ['2026-10-25T02:00Z', '2026-10-26T02:00Z']],
      [
        '30 1 * * *',
        'America/New_York',
        '2026-10-31T12:00Z',
        ['2026-11-01T05:30Z', '2026-11-02T06:30Z'],
      ],
    ])('should run %s in %s once in autumn', (expression, zone, from, expected) => {
      expect(run(expression, zone, from, 48)).toEqual(expected)
    })

    it('should run an hourly job every hour through both transitions', () => {
      expect(run('0 * * * *', 'Europe/Kyiv', '2026-03-28T23:30Z', 4)).toEqual([
        '2026-03-29T00:00Z',
        '2026-03-29T01:00Z',
        '2026-03-29T02:00Z',
        '2026-03-29T03:00Z',
      ])
      expect(run('0 * * * *', 'Europe/Kyiv', '2026-10-24T23:30Z', 4)).toEqual([
        '2026-10-25T00:00Z',
        '2026-10-25T01:00Z',
        '2026-10-25T02:00Z',
        '2026-10-25T03:00Z',
      ])
    })
  })

  describe('presets', () => {
    it.each<[keyof typeof Schedule, string[]]>([
      ['EveryMinute', ['13:08', '13:09']],
      ['EveryFiveMinutes', ['13:10', '13:15']],
      ['EveryTenMinutes', ['13:10', '13:20']],
      ['EveryFifteenMinutes', ['13:15', '13:30']],
      ['EveryThirtyMinutes', ['13:30', '14:00']],
      ['EveryHour', ['14:00', '15:00']],
      ['EveryTwoHours', ['14:00', '16:00']],
      ['EveryThreeHours', ['15:00', '18:00']],
      ['EveryFourHours', ['16:00', '20:00']],
      ['EverySixHours', ['18:00', '26T00:00']],
      ['EveryTwelveHours', ['26T00:00', '26T12:00']],
      ['EveryDay', ['26T00:00', '27T00:00']],
      ['EveryWeek', ['29T00:00', '12-06T00:00']],
      ['EveryMonth', ['12-01T00:00', '2027-01-01T00:00']],
    ])('%s', (preset, expected) => {
      // A Wednesday.
      vi.setSystemTime('2026-11-25T13:07:33.000Z')
      const times: string[] = []
      timer = new CronTimer(Schedule[preset], 'UTC', () => {})
      timer.start()
      for (let i = 0; i < 2; i++) {
        times.push(timer.next!.toISOString())
        vi.setSystemTime(timer.next!)
        timer.stop()
        timer.start()
      }

      expect(times).toEqual(
        expected.map((time) => `${'2026-11-25T13:07'.slice(0, -time.length)}${time}:00.000Z`),
      )
    })

    it('should cover every preset', () => {
      expect(Object.keys(Schedule)).toHaveLength(14)
    })
  })
})
