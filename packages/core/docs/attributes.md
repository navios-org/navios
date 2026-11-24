# Attributes

An attribute is typed metadata attached to a module, a controller or a handler. Guards and interceptors read attributes from `ctx.route` to decide what to do, and tools read them from `app.routes()`.

## Creating an attribute

```ts
import { AttributeFactory } from '@navios/core'
import { z } from 'zod'

// A flag: present or absent
export const Public = AttributeFactory.createAttribute(Symbol.for('Public'))

// A value, validated by a schema when the attribute is applied
export const Roles = AttributeFactory.createAttribute(Symbol.for('Roles'), z.array(z.string()))
```

The schema can be any Standard Schema. It must validate synchronously, because the attribute is applied while classes are being defined. An invalid value throws at that point.

## Applying an attribute

Calling an attribute gives a decorator for a module, a controller or a handler.

```ts
@Public()
@Module({ controllers: [HealthController] })
export class HealthModule {}

@Roles(['staff'])
@Controller()
export class AdminController {
  private readonly jobs = inject(JobsService)

  @Roles(['admin'])
  @Endpoint(purge)
  async purge() {
    await this.jobs.purge()
  }

  @Roles(['admin', 'auditor'])
  @Endpoint(getStats)
  async stats() {
    return this.jobs.stats()
  }

  @Public()
  @Endpoint(ping)
  async ping() {
    return { ok: true }
  }
}
```

Calling an attribute also returns its value, which the options of `@Module`, `@Controller` and `handler()` accept: `@Controller({ attributes: [Roles(['staff'])] })`. For `handler()` fields see [Handlers without decorators](./controllers.md#handlers-without-decorators-handler).

## Reading an attribute

```ts
@Injectable()
export class RolesGuard implements Guard {
  canActivate(ctx: RequestContext) {
    const required = AttributeFactory.get(Roles, ctx.route) // string[] | null
    if (!required) {
      return true
    }
    const user = ctx.get(CurrentUser)
    return required.every((role) => user.roles.includes(role))
  }
}
```

| Call                                        | Result                                                                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `AttributeFactory.has(attribute, route)`    | `true` when the handler, its controller or its module has the attribute.                                                                       |
| `AttributeFactory.get(attribute, route)`    | The most specific value: the handler's, else the controller's, else the module's. `null` when none has it. A flag attribute's value is `true`. |
| `AttributeFactory.getAll(attribute, route)` | Every value, most specific first: handler, controller, module.                                                                                 |

`route` is a `RouteInfo`: `ctx.route` during a request, or an entry of `app.routes()`.

For the module level, the nearest module that sets the attribute wins: a module's own value, else the value of the module that imports it, and so on outwards.

Attributes are identified by their symbol. Use `Symbol.for('name')` when the attribute may be loaded from two copies of a package, and a plain `Symbol('name')` otherwise.
