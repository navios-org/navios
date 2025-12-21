import { Injectable } from '@nestjs/common'
import { getPosts } from '../../../../shared/data.js'
import type { PostsResponse } from '../../../../shared/schemas.js'

@Injectable()
export class PostsService {
  getAll(page: number, pageSize: number): PostsResponse {
    return getPosts(page, pageSize)
  }
}
