import { Module } from '../../../../src/index.mjs'
import { UserController } from './user.controller.mjs'

@Module({
  controllers: [UserController],
})
export class UserModule {
  onModuleInit() {
    console.log('User module initialized')
  }
}
