import type { EndpointParams } from '@navios/core'

import { Controller, Endpoint } from '@navios/core'

import { getSearchResults } from '../../../../shared/data.js'
import { searchEndpoint } from '../api.mjs'

@Controller()
export class SearchController {
  @Endpoint(searchEndpoint)
  search(params: EndpointParams<typeof searchEndpoint>) {
    const { q, page, limit } = params.params
    return getSearchResults(q, page, limit)
  }
}
