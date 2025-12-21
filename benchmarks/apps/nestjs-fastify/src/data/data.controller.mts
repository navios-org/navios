import { Controller, Get } from '@nestjs/common'
import { getLargeData } from '../../../../shared/data.js'

@Controller('data')
export class DataController {
  @Get('large')
  getLargeData() {
    return getLargeData()
  }
}
