import type { CanActivate, ExecutionContext } from '../../../../src/index.mjs'

import { Injectable } from '../../../../src/index.mjs'

@Injectable()
export class OneMoreGuard implements CanActivate {
  canActivate(executionContext: ExecutionContext): Promise<boolean> | boolean {
    console.log('One More Guard activated')
    return true
  }
}
