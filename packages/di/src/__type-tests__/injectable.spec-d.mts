// oxlint-disable no-unused-vars
import { expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import { Injectable } from '../decorators/index.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { InjectionToken } from '../token/token.mjs'
import { Registry } from '../token/registry.mjs'

interface FooService {
  makeFoo(): string
}

const simpleObjectSchema = z.object({
  foo: z.string(),
})
const simpleOptionalObjectSchema = z
  .object({
    foo: z.string(),
  })
  .optional()
const otherObjectSchema = z.object({
  bar: z.string(),
})

const typelessObjectToken = InjectionToken.create(
  Symbol.for('Typeless object token'),
  simpleObjectSchema,
)
const typelessOptionalObjectToken = InjectionToken.create(
  Symbol.for('Typeless optional object token'),
  simpleOptionalObjectSchema,
)

const typedObjectToken = InjectionToken.create<FooService, typeof simpleObjectSchema>(
  Symbol.for('Typed object token'),
  simpleObjectSchema,
)
const typedOptionalObjectToken = InjectionToken.create<
  FooService,
  typeof simpleOptionalObjectSchema
>(Symbol.for('Typed optional object token'), simpleOptionalObjectSchema)

const typedToken = InjectionToken.create<FooService>(Symbol.for('Typed token'))

test('Injectable types', () => {
  // #1 Simple class without arguments
  expectTypeOf(
    @Injectable()
    class {},
  ).toBeConstructibleWith()

  // #1 Injectable with scope
  expectTypeOf(
    @Injectable({ scope: InjectableScope.Transient })
    class {},
  ).toBeConstructibleWith()

  // #1 Injectable with registry
  const registry = new Registry()
  expectTypeOf(
    @Injectable({ registry })
    class {},
  ).toBeConstructibleWith()

  // #1 Injectable w/o decorators enabled in project
  expectTypeOf(
    Injectable({
      token: typedObjectToken,
    })(
      class {
        constructor() {}
        makeFoo() {
          return 'foo'
        }
      },
    ),
  ).toBeConstructibleWith()

  // #2 Class with schema - required argument
  expectTypeOf(
    @Injectable({
      schema: simpleObjectSchema,
    })
    class {
      constructor(public arg: z.infer<typeof simpleObjectSchema>) {}
    },
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #2 It's required in schema but optional in class allowed
  expectTypeOf(
    @Injectable({
      schema: simpleObjectSchema,
    })
    class {
      constructor(public arg?: z.infer<typeof simpleObjectSchema>) {}
    },
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #2 Should fail if not compatible
  // @ts-expect-error Should fail if not compatible
  @Injectable({
    schema: simpleObjectSchema,
  })
  class FailWithOtherSchema {
    constructor(public arg: z.infer<typeof otherObjectSchema>) {}
  }

  // #3 Typeless token with required schema - required argument
  expectTypeOf(
    @Injectable({
      token: typelessObjectToken,
    })
    class {
      constructor(public arg: z.infer<typeof simpleObjectSchema>) {}
    },
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #3 It's required in token but optional in class allowed
  expectTypeOf(
    @Injectable({
      token: typelessObjectToken,
    })
    class {
      constructor(public arg?: z.infer<typeof simpleObjectSchema>) {}
    },
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #3 Optional value but class accepts it
  expectTypeOf(
    @Injectable({
      token: typelessOptionalObjectToken,
    })
    class {
      constructor(public arg: z.infer<typeof simpleOptionalObjectSchema>) {}
    },
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #3 Optional value and class accepts undefined
  expectTypeOf(
    @Injectable({
      token: typelessOptionalObjectToken,
    })
    class {
      constructor(public arg: z.infer<typeof simpleOptionalObjectSchema>) {}
    },
  ).toBeConstructibleWith(undefined)

  // #3 Compatible schemas
  expectTypeOf(
    @Injectable({
      token: typelessOptionalObjectToken,
    })
    class {
      constructor(public arg?: z.infer<typeof simpleObjectSchema>) {}
    },
  ).toBeConstructibleWith(undefined)

  // #3 Token has optional schema, but Class has required, should fail
  expectTypeOf(
    // @ts-expect-error token has optional schema, but Class has required, should fail
    @Injectable({
      token: typelessOptionalObjectToken,
    })
    class {
      constructor(public arg: z.infer<typeof simpleObjectSchema>) {}
    },
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #3 Typed token with required schema - required argument
  expectTypeOf(
    @Injectable({
      token: typedObjectToken,
    })
    class {
      constructor(public arg: z.infer<typeof simpleObjectSchema>) {}

      makeFoo() {
        return this.arg.foo
      }
    },
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #3 Typed token with optional schema
  expectTypeOf(
    @Injectable({
      token: typedOptionalObjectToken,
    })
    class {
      constructor(public arg?: z.infer<typeof simpleObjectSchema>) {}

      makeFoo() {
        return this.arg?.foo ?? 'default'
      }
    },
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #3 Should fail if class doesn't implement token type
  expectTypeOf(
    // @ts-expect-error class doesn't implement the token type
    @Injectable({
      token: typedOptionalObjectToken,
    })
    class {
      constructor(public arg?: z.infer<typeof simpleObjectSchema>) {}
    },
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #3 Should fail if return type doesn't match (returns undefined instead of string)
  expectTypeOf(
    // @ts-expect-error class doesn't implement the token type (wrong return type)
    @Injectable({
      token: typedOptionalObjectToken,
    })
    class {
      constructor(public arg?: z.infer<typeof simpleObjectSchema>) {}

      makeFoo() {
        return this.arg?.foo
      }
    },
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #3 Typed token without schema
  expectTypeOf(
    @Injectable({
      token: typedToken,
    })
    class {
      constructor() {}
      makeFoo() {
        return 'foo'
      }
    },
  ).toBeConstructibleWith()

  // #3 Typed token without schema - fail if not compatible
  expectTypeOf(
    // @ts-expect-error class doesn't implement the token type
    @Injectable({
      token: typedToken,
    })
    class {
      constructor() {}
    },
  ).toBeConstructibleWith()

  // Function call syntax tests (without decorators)

  // #3 Required argument
  expectTypeOf(
    Injectable({
      token: typelessObjectToken,
    })(
      class {
        constructor(public arg: z.infer<typeof simpleObjectSchema>) {}
      },
    ),
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #3 It's required in token but optional in class allowed
  expectTypeOf(
    Injectable({
      token: typelessObjectToken,
    })(
      class {
        constructor(public arg?: z.infer<typeof simpleObjectSchema>) {}
      },
    ),
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #3 Optional value but class accepts it
  expectTypeOf(
    Injectable({
      token: typelessOptionalObjectToken,
    })(
      class {
        constructor(public arg: z.infer<typeof simpleOptionalObjectSchema>) {}
      },
    ),
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #3 Optional value and class accepts undefined
  expectTypeOf(
    Injectable({
      token: typelessOptionalObjectToken,
    })(
      class {
        constructor(public arg: z.infer<typeof simpleOptionalObjectSchema>) {}
      },
    ),
  ).toBeConstructibleWith(undefined)

  // #3 Compatible schemas
  expectTypeOf(
    Injectable({
      token: typelessOptionalObjectToken,
    })(
      class {
        constructor(public arg?: z.infer<typeof simpleObjectSchema>) {}
      },
    ),
  ).toBeConstructibleWith(undefined)

  // #3 Token has optional schema, but Class has required, should fail
  expectTypeOf(
    Injectable({
      token: typelessOptionalObjectToken,
    })(
      // @ts-expect-error token has optional schema, but Class has required, should fail
      class {
        constructor(public arg: z.infer<typeof simpleObjectSchema>) {}
      },
    ),
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #3 Typed token with required schema - required argument
  expectTypeOf(
    Injectable({
      token: typedObjectToken,
    })(
      class {
        constructor(public arg: z.infer<typeof simpleObjectSchema>) {}

        makeFoo() {
          return this.arg.foo
        }
      },
    ),
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #3 Typed token with optional schema
  expectTypeOf(
    Injectable({
      token: typedOptionalObjectToken,
    })(
      class {
        constructor(public arg?: z.infer<typeof simpleObjectSchema>) {}

        makeFoo() {
          return this.arg?.foo ?? 'default'
        }
      },
    ),
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #3 Should fail if class doesn't implement token type
  expectTypeOf(
    Injectable({
      token: typedOptionalObjectToken,
    })(
      // @ts-expect-error class doesn't implement the token type
      class {
        constructor(public arg?: z.infer<typeof simpleObjectSchema>) {}
      },
    ),
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #3 Should fail if return type doesn't match
  expectTypeOf(
    Injectable({
      token: typedOptionalObjectToken,
    })(
      // @ts-expect-error class doesn't implement the token type
      class {
        constructor(public arg?: z.infer<typeof simpleObjectSchema>) {}

        makeFoo() {
          return this.arg?.foo
        }
      },
    ),
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // #3 Typed token without schema
  expectTypeOf(
    Injectable({
      token: typedToken,
    })(
      class {
        constructor() {}
        makeFoo() {
          return 'foo'
        }
      },
    ),
  ).toBeConstructibleWith()

  // #3 Typed token without schema - fail if not compatible
  expectTypeOf(
    Injectable({
      token: typedToken,
    })(
      // @ts-expect-error class doesn't implement the token type
      class {
        constructor() {}
      },
    ),
  ).toBeConstructibleWith()
})

test('Injectable with classes that have static fields', () => {
  // Simple class with static fields - decorator syntax
  expectTypeOf(
    @Injectable()
    class ServiceWithStatics {
      static readonly VERSION = '1.0.0'
      static create() {
        return new ServiceWithStatics()
      }

      getValue() {
        return 42
      }
    },
  ).toBeConstructibleWith()

  // Class with static fields and scope
  expectTypeOf(
    @Injectable({ scope: InjectableScope.Transient })
    class ServiceWithStaticsAndScope {
      static readonly DEFAULT_VALUE = 100
      static instances: ServiceWithStaticsAndScope[] = []

      getValue() {
        return ServiceWithStaticsAndScope.DEFAULT_VALUE
      }
    },
  ).toBeConstructibleWith()

  // Class with static fields and typed token
  expectTypeOf(
    @Injectable({
      token: typedToken,
    })
    class ServiceWithStaticsAndToken {
      static readonly SERVICE_NAME = 'FooServiceImpl'

      makeFoo() {
        return ServiceWithStaticsAndToken.SERVICE_NAME
      }
    },
  ).toBeConstructibleWith()

  // Class with static fields and typed token with schema
  expectTypeOf(
    @Injectable({
      token: typedObjectToken,
    })
    class ServiceWithStaticsAndTokenSchema {
      static readonly DEFAULT_FOO = 'default-foo'

      constructor(public config: z.infer<typeof simpleObjectSchema>) {}

      makeFoo() {
        return this.config.foo || ServiceWithStaticsAndTokenSchema.DEFAULT_FOO
      }
    },
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // Function call syntax with static fields
  expectTypeOf(
    Injectable()(
      class ServiceWithStaticsFn {
        static readonly VERSION = '2.0.0'

        getValue() {
          return ServiceWithStaticsFn.VERSION
        }
      },
    ),
  ).toBeConstructibleWith()

  // Function call syntax with static fields and schema
  expectTypeOf(
    Injectable({
      schema: simpleObjectSchema,
    })(
      class ServiceWithStaticsAndSchemaFn {
        static readonly PREFIX = 'value:'

        constructor(public config: z.infer<typeof simpleObjectSchema>) {}

        getValue() {
          return ServiceWithStaticsAndSchemaFn.PREFIX + this.config.foo
        }
      },
    ),
  ).toBeConstructibleWith({
    foo: 'something',
  })

  // Class with generic static methods
  expectTypeOf(
    @Injectable()
    class ServiceWithGenericStatics {
      static create<T>(_value: T): ServiceWithGenericStatics {
        return new ServiceWithGenericStatics()
      }

      getValue() {
        return 42
      }
    },
  ).toBeConstructibleWith()

  // Class with private static fields
  expectTypeOf(
    @Injectable()
    class ServiceWithPrivateStatics {
      static #counter = 0
      private static _secretKey = 'secret'

      static getCount() {
        return this.#counter
      }

      getValue() {
        return ServiceWithPrivateStatics.getCount()
      }
    },
  ).toBeConstructibleWith()

  // Class with inherited static fields
  class BaseWithStatics {
    static readonly BASE_VERSION = '1.0.0'
  }

  expectTypeOf(
    @Injectable()
    class DerivedWithStatics extends BaseWithStatics {
      static readonly DERIVED_VERSION = '2.0.0'

      getVersions() {
        return `${DerivedWithStatics.BASE_VERSION}-${DerivedWithStatics.DERIVED_VERSION}`
      }
    },
  ).toBeConstructibleWith()
})

test('Injectable with static object fields and schema works with explicit type annotation', () => {
  // NOTE: When using @Injectable with schema and static object fields,
  // some IDE/TypeScript configurations may report:
  // "'DEFAULT_CONFIG' implicitly has type 'any' because it does not have a
  // type annotation and is referenced directly or indirectly in its own initializer."
  //
  // This can happen due to circular type inference: the decorator's generic type
  // tries to infer the full class type (including static members), but inferring
  // the static member type requires knowing the class type first.
  //
  // RECOMMENDATION: Add explicit type annotations to static object fields when
  // using @Injectable with schema to ensure consistent behavior across all
  // TypeScript configurations.

  // With explicit type annotation - always works:
  expectTypeOf(
    @Injectable({
      schema: simpleObjectSchema,
    })
    class ServiceWithStaticObjectWithAnnotation {
      static readonly DEFAULT_CONFIG: { foo: string } = { foo: 'default' }

      constructor(public config: z.infer<typeof simpleObjectSchema>) {}

      getValue() {
        return this.config.foo
      }
    },
  ).toBeConstructibleWith({
    foo: 'something',
  })
})
