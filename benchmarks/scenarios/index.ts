export * from './types.js'
export { coldStartConfig, COLD_START_ITERATIONS } from './cold-start.js'
export { lightLoadConfig } from './light-load.js'
export { moderateLoadConfig } from './moderate-load.js'
export { heavyLoadConfig } from './heavy-load.js'
export { sustainedLoadConfig, MEMORY_SAMPLE_INTERVAL } from './sustained-load.js'

import { coldStartConfig } from './cold-start.js'
import { lightLoadConfig } from './light-load.js'
import { moderateLoadConfig } from './moderate-load.js'
import { heavyLoadConfig } from './heavy-load.js'
import { sustainedLoadConfig } from './sustained-load.js'
import type { BenchmarkConfig } from './types.js'

export const ALL_SCENARIOS: Record<string, BenchmarkConfig> = {
  'cold-start': coldStartConfig,
  'light-load': lightLoadConfig,
  'moderate-load': moderateLoadConfig,
  'heavy-load': heavyLoadConfig,
  'sustained-load': sustainedLoadConfig,
}
