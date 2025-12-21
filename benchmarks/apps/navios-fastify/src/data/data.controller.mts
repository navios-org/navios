import { Controller, Endpoint } from '@navios/core'

import { getLargeData } from '../../../../shared/data.js'
import { largeDataEndpoint } from '../api.mjs'

@Controller()
export class DataController {
  @Endpoint(largeDataEndpoint)
  getLargeData() {
    return getLargeData()
  }
}
