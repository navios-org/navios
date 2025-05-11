import type { Path, PathValue } from '../../../src/index.mjs'

import { provideConfig } from '../../../src/index.mjs'
import { configureConfig } from './configuration.mjs'

export type ConfigType = ReturnType<typeof configureConfig>
export type ConfigTypePaths = Path<ConfigType>
export type ConfigMap = {
  [K in ConfigTypePaths]: PathValue<ConfigType, K>
}

export const ConfigService = provideConfig<ConfigMap>({
  load: configureConfig,
})
