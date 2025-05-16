import type { ClassType } from '@navios/core'

import { Injectable } from '@navios/core'

import { getScheduleMetadata } from '../metadata/index.mjs'

export function Schedulable() {
  return (target: ClassType, context: ClassDecoratorContext) => {
    if (context.kind !== 'class') {
      throw new Error(
        `SchedulableDecorator can only be applied to classes, not ${context.kind}`,
      )
    }
    if (context.metadata) {
      getScheduleMetadata(target, context)
    }
    return Injectable()(target, context)
  }
}
