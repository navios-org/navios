import type { AnyZodObject } from 'zod'

import type {
  InjectableScope,
  InjectableType,
  InjectionToken,
} from '../index.mjs'

export interface InjectableMetadata<Instance = any, Schema = any> {
  type: InjectableType
  scope: InjectableScope
  token: InjectionToken<Instance, Schema>
}
