---
title: Guards and interceptors
---

# Guards and interceptors

A guard decides whether a request may continue. An interceptor wraps the handling of a request and can act before it, after it, or instead of it. Both are `@Injectable()` singletons created once at start-up, so neither may keep per-request data in a field.

Where the two sit among the other stages of a request is shown in [How a request is handled](/docs/server/request-lifecycle). In short: interceptors enter first, guards run inside them, and both run before the body is read.

## Guards

A guard is a class with a `canActivate(ctx)` method.

```ts title="api-key.guard.mts"
import { inject, Injectable, UnauthorizedException } from '@navios/core'

import type { Guard, RequestContext } from '@navios/core'

@Injectable()
export class ApiKeyGuard implements Guard {
  private readonly keys = inject(ApiKeyService)

  canActivate(ctx: RequestContext) {
    if (!this.keys.isValid(ctx.headers.get('x-api-key'))) {
      throw new UnauthorizedException('Missing or invalid API key')
    }
    return true
  }
}
```

- `canActivate` returns `boolean` or `Promise<boolean>`. A synchronous guard adds no promise to the request.
- Only `true` lets the request through. `false`, or any other value, answers 403 through the [Forbidden responder](/docs/server/essentials/errors#responders). Throw an [`HttpException`](/docs/server/essentials/errors#httpexception) for any other status, as the guard above does for 401.
- A guard reads the request through the [request context](/docs/server/essentials/request-context): headers, cookies, `ctx.urlParams`, `ctx.query` and `ctx.route`. URL parameters and the query are raw strings there and the body is not available, because validation comes after guards.
- A guard may set response headers and cookies with `ctx.reply`, for example rate-limit headers.
- A guard passes what it learned, such as the current user, to later guards and to the handler through a [context key](/docs/server/guides/request-state).

A guard that returns `false` is the short form for "authenticated, but not allowed":

```ts
@Injectable()
export class AdminGuard implements Guard {
  canActivate(ctx: RequestContext) {
    return ctx.headers.get('x-role') === 'admin'
  }
}
```

A complete token-based guard is built in [Authentication with JWT](/docs/server/guides/authentication). Exempting single routes from a module-wide guard is done with an [attribute](/docs/server/guides/attributes).

### Attaching guards

```ts
// Every route of the module and of the modules it imports
@Module({ controllers: [UsersController], guards: [ApiKeyGuard] })
export class AppModule {}

// Every route of a controller
@UseGuards(ApiKeyGuard)
@Controller()
export class AccountController {}

@Controller({ guards: [ApiKeyGuard] })
export class BillingController {}

// One handler
@Controller()
export class AdminController {
  @UseGuards(AdminGuard)
  @Endpoint(deleteUser)
  async deleteUser({ urlParams }: HandlerParams<typeof deleteUser>) {
    // ...
  }
}
```

- Guards run module first, then controller, then handler. Within one level they run in the order given. Module guards include those inherited from importing modules, outermost first.
- A guard class that appears at more than one level runs once, at its first position.
- The first guard that denies or throws stops the request. Later guards do not run.
- On a class, place `@UseGuards` above `@Controller` or `@Module`.
- There is no separate application-level guard list. Put application-wide guards on the root module.

A class listed as a guard must be `@Injectable()` and have a `canActivate` method, or `init()` fails.

## Interceptors

An interceptor is a class with an `intercept(ctx, next)` method. Calling `next()` runs the rest of the pipeline: inner interceptors, guards, validation and the handler.

```ts title="timing.interceptor.mts"
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
- When a guard, validation or the handler throws, `next()` rejects with the original error. The error becomes a response only after the outermost interceptor has exited, so an interceptor sees failures as exceptions, never as 4xx or 5xx results. Rethrow the error unless you intend to replace the response.
- An interceptor may return a different `RouteResult`, or return one without calling `next()` to answer the request itself:

```ts
@Injectable()
export class CacheInterceptor implements Interceptor {
  private readonly cache = new Map<string, RouteResult>()

  async intercept(ctx: RequestContext, next: () => Promise<RouteResult>) {
    const hit = this.cache.get(ctx.path)
    if (hit) {
      return hit
    }
    const result = await next()
    this.cache.set(ctx.path, result)
    return result
  }
}
```

To act when the response has actually been sent, rather than when the handler has returned, register a callback with [`ctx.onFinish`](/docs/server/essentials/request-context#when-the-response-has-finished).

### Attaching interceptors

Interceptors attach at four levels, outermost first:

```ts
// 1. Application: around every route, including routes added by plugins
app.intercept(TimingInterceptor)

// 2. Module
@Module({ controllers: [UsersController], interceptors: [TimingInterceptor] })
export class UsersModule {}

// 3. Controller
@UseInterceptors(CacheInterceptor)
@Controller()
export class CatalogController {}

// 4. Handler
@Controller()
export class ProfileController {
  @UseInterceptors(CacheInterceptor)
  @Endpoint(getUser)
  async getUser({ urlParams }: HandlerParams<typeof getUser>) {
    // ...
  }
}
```

- Within one level the first interceptor given is the outermost.
- An interceptor class that appears at more than one level runs once.
- `app.intercept()` must be called before `init()`.
- An interceptor does not run for a request that matches no route.

## Which one to use

| You want to…                                              | Use                                              |
| --------------------------------------------------------- | ------------------------------------------------ |
| reject a request based on headers, cookies or the route   | a guard                                          |
| establish who is calling and make it available downstream | a guard that sets a context key                  |
| measure, log or trace a request                           | an interceptor                                   |
| change or replace a successful result                     | an interceptor                                   |
| turn a thrown error into a specific response              | [`app.mapError`](/docs/server/essentials/errors#mapping-domain-errors), not an interceptor |
