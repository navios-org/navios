# Guards and interceptors

Both are singletons, created once at `init()`. The same instance serves every request, so neither may keep per-request data in a field; put it in the [request context](./request-state.md).

## Order of a request

1. Interceptors enter, outermost first.
2. Guards run: module, then controller, then handler.
3. The request is validated: URL parameters, query, then the body, which is read at this point.
4. The handler runs.
5. The response is validated against the declared schema.
6. Interceptors exit, innermost first.
7. Anything thrown in steps 1 to 6 is turned into a response. See [Errors](./errors.md).

Guards run before the body is read. An unauthenticated request is rejected without parsing its body, and a request with both a missing token and an invalid body gets 401, not 400.

Stages a route does not use are not part of its compiled function. A route with no guards, no interceptors and no request schemas is a call to the handler plus response handling.

## Guards

```ts
import { AttributeFactory, inject, Injectable, UnauthorizedException } from '@navios/core'

import type { Guard, RequestContext } from '@navios/core'

@Injectable()
export class AuthGuard implements Guard {
  private readonly auth = inject(AuthService)

  async canActivate(ctx: RequestContext) {
    if (AttributeFactory.has(Public, ctx.route)) {
      return true
    }
    const user = await this.auth.verify(ctx.headers.get('authorization'))
    if (!user) {
      throw new UnauthorizedException('Missing or invalid token')
    }
    ctx.set(CurrentUser, user)
    return true
  }
}
```

- `canActivate(ctx)` returns `boolean` or `Promise<boolean>`. A synchronous guard adds no promise to the request.
- Only `true` lets the request through. `false`, or any other value, answers 403 through the Forbidden responder. Throw an `HttpException` for any other status.
- A guard reads the request through `ctx`: `ctx.urlParams`, `ctx.query`, `ctx.headers`, `ctx.cookies`, `ctx.route` and [attributes](./attributes.md). URL parameters and query are raw strings there, because validation comes after guards, and the body has not been read yet.
- A guard may set response headers and cookies with `ctx.reply`, for example rate-limit headers.
- A guard passes data to later guards and to the handler with a [context key](./request-state.md#context-keys).

### Attaching guards

```ts
// Every route of the module and of the modules it imports
@Module({ controllers: [UsersController], guards: [AuthGuard] })
export class UsersModule {}

// Every route of a controller
@UseGuards(AuthGuard)
@Controller()
export class AccountController {}

@Controller({ guards: [AuthGuard] })
export class BillingController {}

// One handler
@Controller()
export class AdminController {
  private readonly metrics = inject(MetricsService)

  @UseGuards(RolesGuard)
  @Endpoint(getStats)
  async stats() {
    return this.metrics.read()
  }
}
```

- Order is module, controller, handler. Within one level, guards run in the order given. Module guards include those inherited from importing modules, outermost first.
- A guard class that appears at more than one level runs once, at its first position.
- The first guard that denies or throws stops the request.
- On a class, place `@UseGuards` above `@Controller` or `@Module`.
- There is no separate application-level guard list. Put application-wide guards on the root module.

A class listed as a guard that has no `canActivate` method fails at `init()`.

## Interceptors

An interceptor wraps the rest of the pipeline: guards, validation and the handler.

```ts
import { inject, Injectable, Logger } from '@navios/core'

import type { Interceptor, RequestContext, RouteResult } from '@navios/core'

@Injectable()
export class TimingInterceptor implements Interceptor {
  private readonly logger = inject(Logger, { context: 'Timing' })

  async intercept(ctx: RequestContext, next: () => Promise<RouteResult>) {
    const started = performance.now()
    try {
      const result = await next()
      ctx.reply.header('server-timing', `app;dur=${(performance.now() - started).toFixed(1)}`)
      return result
    } catch (error) {
      this.logger.warn(`${ctx.method} ${ctx.path} failed`)
      throw error
    }
  }
}
```

- `next()` resolves to the `RouteResult` of a successful request: `{ status, body, kind, headers?, cookies? }`. For a JSON response, `body` is the validated body, not yet serialised.
- When a guard, validation or the handler throws, `next()` rejects with the original error. The error is mapped to a response after the outermost interceptor has exited, so an interceptor sees errors as exceptions, never as 4xx or 5xx results. Rethrow the error unless you intend to replace the response.
- An interceptor may return a different `RouteResult`, or return one without calling `next()` to answer the request itself.
- Headers set with `ctx.reply.header()` are sent on error responses too.

### Attaching interceptors

Interceptors attach at four levels, outermost first:

```ts
// 1. Application: around every route, including routes added by plugins
app.intercept(TimingInterceptor)

// 2. Module
@Module({ controllers: [UsersController], interceptors: [AuditInterceptor] })
export class UsersModule {}

// 3. Controller
@UseInterceptors(CacheInterceptor)
@Controller()
export class CatalogController {}

// 4. Handler
@UseInterceptors(CacheInterceptor)
@Endpoint(listItems)
async list() {
  return this.items.list()
}
```

Within one level the first interceptor given is the outermost. An interceptor class that appears at more than one level runs once. `app.intercept()` must be called before `init()`.

A plugin adds an application-level interceptor with `api.intercept()`. See [Plugins](./plugins.md).
