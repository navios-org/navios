import type { EndpointParams } from '@navios/core'
import { Controller, Endpoint } from '@navios/core'
import { searchEndpoint } from '../api.mjs'
import { getSearchResults } from '../../../../shared/data.js'

@Controller()
export class SearchController {
  @Endpoint(searchEndpoint)
  search(params: EndpointParams<typeof searchEndpoint>) {
    const { q, page, limit } = params.params
    return getSearchResults(q, page, limit)
  }
}
