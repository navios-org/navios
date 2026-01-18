// oxlint-disable no-unused-vars
import { expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import { Injectable } from '../decorators/index.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { InjectionToken } from '../token/injection-token.mjs'
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
