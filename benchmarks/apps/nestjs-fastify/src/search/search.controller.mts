import { Controller, Get, Query } from '@nestjs/common'
import { getSearchResults } from '../../../../shared/data.js'

@Controller('search')
export class SearchController {
  @Get()
  search(
    @Query('q') q: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return getSearchResults(q, parseInt(page, 10), parseInt(limit, 10))
  }
}
