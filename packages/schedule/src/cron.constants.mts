/**
 * Pre-defined cron schedule constants for common scheduling patterns.
 *
 * These constants provide convenient shortcuts for frequently used cron expressions,
 * making it easier to schedule jobs without manually writing cron expressions.
 *
 * @example
 * ```typescript
 * import { Schedule } from '@navios/schedule'
 *
 * @Schedulable()
 * class TaskService {
 *   @Cron(Schedule.EveryMinute)
 *   async everyMinute() {}
 *
 *   @Cron(Schedule.EveryHour)
 *   async hourly() {}
 *
 *   @Cron(Schedule.EveryDay)
 *   async daily() {}
 * }
 * ```
 *
 * @public
 */
export enum Schedule {
  EveryMinute = '*/1 * * * *',
  EveryFiveMinutes = '*/5 * * * *',
  EveryTenMinutes = '*/10 * * * *',
  EveryFifteenMinutes = '*/15 * * * *',
  EveryThirtyMinutes = '*/30 * * * *',
  EveryHour = '0 * * * *',
  EveryTwoHours = '0 */2 * * *',
  EveryThreeHours = '0 */3 * * *',
  EveryFourHours = '0 */4 * * *',
  EverySixHours = '0 */6 * * *',
  EveryTwelveHours = '0 */12 * * *',
  EveryDay = '0 0 * * *',
  EveryWeek = '0 0 * * 0',
  EveryMonth = '0 0 1 * *',
}
