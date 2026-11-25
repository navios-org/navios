import { AttributeFactory, Module, UseGuards, UseInterceptors } from '../index.mjs'
import { describeHandlerClass } from '../metadata/handler-class.mjs'

import {
  Around,
  describeInheritance,
  GuardBase,
  GuardChild,
  GuardMember,
  GuardOption,
  textSchema,
} from './inheritance-matrix.mjs'

import type { InheritanceFixture } from './inheritance-matrix.mjs'

// The same classes as in legacy-compat/__tests__/decorator-inheritance.spec.mts.

const Marked = AttributeFactory.createAttribute(Symbol.for('test.inheritance.Marked'))
const Level = AttributeFactory.createAttribute(Symbol.for('test.inheritance.Level'), textSchema)

const described: InheritanceFixture['described'] = new Map()

function Handlers() {
  return <T extends new (...args: any[]) => any>(target: T, context: ClassDecoratorContext): T => {
    described.set(target, describeHandlerClass(context))
    return target
  }
}

@UseGuards(GuardBase)
@Module({ guards: [GuardOption], interceptors: [Around], attributes: [Level('base')] })
class BaseModule {}

@Module({ guards: [GuardChild] })
class ChildModule extends BaseModule {}

@Module({ guards: [GuardOption] })
@UseGuards(GuardBase)
class Below {}

@UseGuards(GuardBase)
@Module({ guards: [GuardOption] })
class Above {}

@Level('base')
@UseInterceptors(Around)
@Handlers()
@UseGuards(GuardBase)
class Base {
  @UseGuards(GuardMember)
  @Marked()
  async inherited() {}
}

@Handlers()
@UseGuards(GuardChild)
class Child extends Base {
  @UseGuards(GuardChild)
  async own() {}
}

@Handlers()
@Level('child')
class Overriding extends Base {
  @UseGuards(GuardChild)
  override async inherited() {}
}

abstract class AbstractCrud {
  @UseGuards(GuardMember)
  async removeAll() {}

  @UseGuards(GuardMember)
  field = () => {}
}

@Handlers()
class Crud extends AbstractCrud {}

class Between extends Base {}

@Handlers()
class Grandchild extends Between {}

@Handlers()
class Plain {}

describeInheritance({
  described,
  Marked,
  Level,
  BaseModule,
  ChildModule,
  Below,
  Above,
  Base,
  Child,
  Overriding,
  Crud,
  Plain,
  Grandchild,
})
