---
sidebar_position: 5
---

# Multi-Tenant Applications

This recipe shows how to handle multi-tenant scenarios using request-scoped services.

## Request-Scoped Tenant Context

```typescript
@Injectable({ scope: InjectableScope.Request })
class TenantContext {
  private readonly tenantId: string
  private readonly tenantConfig: any

  constructor(tenantId: string, tenantConfig: any) {
    this.tenantId = tenantId
    this.tenantConfig = tenantConfig
  }

  getTenantId() {
    return this.tenantId
  }

  getConfig() {
    return this.tenantConfig
  }
}
```

## Tenant-Aware Service

```typescript
@Injectable({ scope: InjectableScope.Request })
class TenantDatabaseService {
  private readonly tenantContext = inject(TenantContext)
  private readonly db = inject(DatabaseService)

  async query(sql: string) {
    const tenantId = this.tenantContext.getTenantId()
    // Modify query to include tenant isolation
    return this.db.query(`${sql} WHERE tenant_id = '${tenantId}'`)
  }
}
```

## Usage in Web Framework

```typescript
app.use(async (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] as string
  const tenantConfig = await getTenantConfig(tenantId)

  const scoped = container.beginRequest(`req-${Date.now()}`, {
    tenantId,
    tenantConfig,
  })

  // Add tenant context to request
  scoped.addInstance(
    InjectionToken.create<TenantContext>('TenantContext'),
    new TenantContext(tenantId, tenantConfig)
  )

  ;(req as any).scoped = scoped

  res.on('finish', async () => {
    await scoped.endRequest()
  })

  next()
})
```

