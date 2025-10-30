// oxlint-disable no-unused-vars
import { expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import { Injectable } from '../decorators/index.mjs'
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
const otherObjectSchema = z.object({
  bar: z.string(),
})
const otherOptionalObjectSchema = z
  .object({
    bar: z.string(),
  })
  .optional()
// const simpleRecordSchema = z.record(z.string(), z.string())
// const simpleOptionalRecordSchema = z.record(z.string(), z.string()).optional()

const typelessObjectToken = InjectionToken.create(
  Symbol.for('Typeless object token'),
  simpleObjectSchema,
)
const typelessOptionalObjectToken = InjectionToken.create(
  Symbol.for('Typeless optional object token'),
  simpleOptionalObjectSchema,
)
// const typelessRecordToken = InjectionToken.create(
//   Symbol.for('Typeless record token'),
//   simpleRecordSchema,
// )
// const typelessOptionalRecordToken = InjectionToken.create(
//   Symbol.for('Typeless optional record token'),
//   simpleOptionalRecordSchema,
// )

const typedObjectToken = InjectionToken.create<
  FooService,
  typeof simpleObjectSchema
>(Symbol.for('Typed object token'), simpleObjectSchema)
const typedOptionalObjectToken = InjectionToken.create<
  FooService,
  typeof simpleOptionalObjectSchema
>(Symbol.for('Typed optional object token'), simpleOptionalObjectSchema)
// const typedRecordToken = InjectionToken.create<
//   FooService,
//   typeof simpleRecordSchema
// >(Symbol.for('Typed record token'), simpleRecordSchema)
// const typedOptionalRecordToken = InjectionToken.create<
//   FooService,
//   typeof simpleOptionalRecordSchema
// >(Symbol.for('Typed optional record token'), simpleOptionalRecordSchema)

const typedToken = InjectionToken.create<FooService>(Symbol.for('Typed token'))

test('Injectable types', () => {
  // #1
  expectTypeOf(
    @Injectable()
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

  // #2 required argument
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
  // #2 it's required in schema but optional in class allowed
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
  // #2 should fail if not compatible
  // @ts-expect-error Should fail if not compatible
  @Injectable({
    schema: simpleObjectSchema,
  })
  class FailWithOtherSchema {
    constructor(public arg: z.infer<typeof otherObjectSchema>) {}
  }

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
})
