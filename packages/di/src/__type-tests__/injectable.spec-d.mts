import { expectTypeOf, test } from 'vitest'
import { z } from 'zod'

import { Injectable } from '../decorators/index.mjs'
import { InjectableType } from '../enums/index.mjs'
import { InjectionToken } from '../injection-token.mjs'

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
const simpleRecordSchema = z.record(z.string())
const simpleOptionalRecordSchema = z.record(z.string()).optional()

const typelessObjectToken = InjectionToken.create(
  Symbol.for('Typeless object token'),
  simpleObjectSchema,
)
const typelessOptionalObjectToken = InjectionToken.create(
  Symbol.for('Typeless optional object token'),
  simpleOptionalObjectSchema,
)
const typelessRecordToken = InjectionToken.create(
  Symbol.for('Typeless record token'),
  simpleRecordSchema,
)
const typelessOptionalRecordToken = InjectionToken.create(
  Symbol.for('Typeless optional record token'),
  simpleOptionalRecordSchema,
)

const typedObjectToken = InjectionToken.create<
  FooService,
  typeof simpleObjectSchema
>(Symbol.for('Typed object token'), simpleObjectSchema)
const typedOptionalObjectToken = InjectionToken.create<
  FooService,
  typeof simpleOptionalObjectSchema
>(Symbol.for('Typed optional object token'), simpleOptionalObjectSchema)
const typedRecordToken = InjectionToken.create<
  FooService,
  typeof simpleRecordSchema
>(Symbol.for('Typed record token'), simpleRecordSchema)
const typedOptionalRecordToken = InjectionToken.create<
  FooService,
  typeof simpleOptionalRecordSchema
>(Symbol.for('Typed optional record token'), simpleOptionalRecordSchema)

const typedToken = InjectionToken.create<FooService>(Symbol.for('Typed token'))

test('Injectable types', () => {
  // #1
  expectTypeOf(
    @Injectable()
    class {},
  ).toBeConstructibleWith()
  // #2
  expectTypeOf(
    @Injectable({
      type: InjectableType.Factory,
    })
    class {
      create() {}
    },
  ).toBeConstructibleWith()
  expectTypeOf(
    // @ts-expect-error should check that the class implements the factory
    @Injectable({
      type: InjectableType.Factory,
    })
    class {},
  ).toBeConstructibleWith()

  // #3 required argument
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
  // #3 it's required in token but optional in class allowed
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
  // #3 optional value but class accepts it
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
  // #3 optional value and class accepts it
  expectTypeOf(
    @Injectable({
      token: typelessOptionalObjectToken,
    })
    class {
      constructor(public arg: z.infer<typeof simpleOptionalObjectSchema>) {}
    },
  ).toBeConstructibleWith(undefined)
  // #3 compatible schemas
  expectTypeOf(
    @Injectable({
      token: typelessOptionalObjectToken,
    })
    class {
      constructor(public arg?: z.infer<typeof simpleObjectSchema>) {}
    },
  ).toBeConstructibleWith(undefined)
  // #3 compatible schemas
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

  // #3 typed token and required argument
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
  // #3 typed token and required argument
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
  // #3 should fail if not compatible
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
  // #3 should fail if not compatible
  expectTypeOf(
    // @ts-expect-error class doesn't implement the token type
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
  // #3 typed token without schema
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
  // #3 typed token without schema fail if not compatible
  expectTypeOf(
    // @ts-expect-error class doesn't implement the token type
    @Injectable({
      token: typedToken,
    })
    class {
      constructor() {}
    },
  ).toBeConstructibleWith()

  // #4 factory with typed token
  expectTypeOf(
    @Injectable({
      type: InjectableType.Factory,
      token: typedToken,
    })
    class {
      constructor() {}
      create() {
        return {
          makeFoo: () => 'foo',
        }
      }
    },
  ).toBeConstructibleWith()
  // #4 factory with typed token without schema should fail if not compatible
  expectTypeOf(
    // @ts-expect-error factory doesn't implement the token type
    @Injectable({
      type: InjectableType.Factory,
      token: typedToken,
    })
    class {
      constructor() {}
      create(ctx: any, arg: z.infer<typeof simpleObjectSchema>) {
        return {
          makeFoo: () => 'foo',
        }
      }
    },
  ).toBeConstructibleWith()
  // #4 factory with typed token fail if not compatible
  expectTypeOf(
    // @ts-expect-error class doesn't implement the token type
    @Injectable({
      type: InjectableType.Factory,
      token: typedToken,
    })
    class {
      constructor() {}
      create() {
        return {
          // makeFoo: () => 'foo',
        }
      }
    },
  ).toBeConstructibleWith()
  // #4 factory with typed token and schema
  expectTypeOf(
    @Injectable({
      type: InjectableType.Factory,
      token: typedObjectToken,
    })
    class {
      constructor() {}
      create(ctx: any, arg: z.infer<typeof simpleObjectSchema>) {
        return {
          makeFoo: () => 'foo',
        }
      }
    },
  )

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
  expectTypeOf(
    Injectable({
      type: InjectableType.Factory,
    })(
      class {
        create() {}
      },
    ),
  ).toBeConstructibleWith()
  expectTypeOf(
    Injectable({
      type: InjectableType.Factory,
    })(
      // @ts-expect-error should check that the class implements the factory
      class {},
    ),
  ).toBeConstructibleWith()

  // #3 required argument
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
  // #3 it's required in token but optional in class allowed
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
  // #3 optional value but class accepts it
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
  // #3 optional value and class accepts it
  expectTypeOf(
    Injectable({
      token: typelessOptionalObjectToken,
    })(
      class {
        constructor(public arg: z.infer<typeof simpleOptionalObjectSchema>) {}
      },
    ),
  ).toBeConstructibleWith(undefined)
  // #3 compatible schemas
  expectTypeOf(
    Injectable({
      token: typelessOptionalObjectToken,
    })(
      class {
        constructor(public arg?: z.infer<typeof simpleObjectSchema>) {}
      },
    ),
  ).toBeConstructibleWith(undefined)
  // #3 compatible schemas
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

  // #3 typed token and required argument
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
  // #3 typed token and required argument
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
  // #3 should fail if not compatible
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
  // #3 should fail if not compatible
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
  // #3 typed token without schema
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
  // #3 typed token without schema fail if not compatible
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

  // #4 factory with typed token
  expectTypeOf(
    Injectable({
      type: InjectableType.Factory,
      token: typedToken,
    })(
      class {
        constructor() {}
        create() {
          return {
            makeFoo: () => 'foo',
          }
        }
      },
    ),
  ).toBeConstructibleWith()
  // #4 factory with typed token without schema should fail if not compatible
  expectTypeOf(
    Injectable({
      type: InjectableType.Factory,
      token: typedToken,
    })(
      // @ts-expect-error factory doesn't implement the token type
      class {
        constructor() {}
        create(ctx: any, arg: z.infer<typeof simpleObjectSchema>) {
          return {
            makeFoo: () => 'foo',
          }
        }
      },
    ),
  ).toBeConstructibleWith()
  // #4 factory with typed token fail if not compatible
  expectTypeOf(
    Injectable({
      type: InjectableType.Factory,
      token: typedToken,
    })(
      // @ts-expect-error class doesn't implement the token type
      class {
        constructor() {}
        create() {
          return {
            // makeFoo: () => 'foo',
          }
        }
      },
    ),
  ).toBeConstructibleWith()
  // #4 factory with typed token and schema
  expectTypeOf(
    Injectable({
      type: InjectableType.Factory,
      token: typedObjectToken,
    })(
      class {
        constructor() {}
        create(ctx: any, arg: z.infer<typeof simpleObjectSchema>) {
          return {
            makeFoo: () => 'foo',
          }
        }
      },
    ),
  )
})
