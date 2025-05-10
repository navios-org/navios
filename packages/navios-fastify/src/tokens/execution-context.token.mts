import { InjectionToken } from '../service-locator/index.mjs'
import { ExecutionContext } from '../services/index.mjs'

export const ExecutionContextInjectionToken = 'ExecutionContextInjectionToken'

export const ExecutionContextToken = InjectionToken.create<ExecutionContext>(
  ExecutionContextInjectionToken,
)
