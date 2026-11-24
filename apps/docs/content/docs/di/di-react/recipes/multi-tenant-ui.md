---
sidebar_position: 6
---

# Multi-Tenant UI

This recipe shows how to handle multi-tenant scenarios in React using `ScopeProvider`.

## Tenant-Scoped Services

```tsx
import { Injectable, InjectableScope } from '@navios/di'
import { ScopeProvider, useScopeMetadata } from '@navios/di-react'

@Injectable({ scope: InjectableScope.Request })
class TenantService {
  private tenantId: string

  setTenantId(tenantId: string) {
    this.tenantId = tenantId
  }

  getTenantId() {
    return this.tenantId
  }
}

function TenantDashboard({ tenantId }: { tenantId: string }) {
  return (
    <ScopeProvider
      scopeId={`tenant-${tenantId}`}
      metadata={{ tenantId, timestamp: Date.now() }}
    >
      <TenantContent />
    </ScopeProvider>
  )
}

function TenantContent() {
  const tenantId = useScopeMetadata<string>('tenantId')
  const { data: tenantService } = useService(TenantService)

  useEffect(() => {
    tenantService?.setTenantId(tenantId || '')
  }, [tenantService, tenantId])

  return (
    <div>
      <h1>Tenant: {tenantId}</h1>
      {/* Tenant-specific content */}
    </div>
  )
}
```

