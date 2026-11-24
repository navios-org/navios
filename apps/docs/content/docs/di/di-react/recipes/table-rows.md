---
sidebar_position: 4
---

# Table Rows

This recipe shows how to use `ScopeProvider` to create isolated service instances for each table row.

## Isolated Row Services

```tsx
import { Injectable, InjectableScope } from '@navios/di'
import { ScopeProvider, useService } from '@navios/di-react'

@Injectable({ scope: InjectableScope.Request })
class RowService {
  private data: any

  setData(data: any) {
    this.data = data
  }

  getData() {
    return this.data
  }

  async save() {
    // Save row data
    return { success: true }
  }
}

function TableRow({ row }) {
  const { data: rowService } = useService(RowService)

  useEffect(() => {
    rowService?.setData(row)
  }, [rowService, row])

  const handleSave = async () => {
    await rowService?.save()
  }

  return (
    <tr>
      <td>{row.name}</td>
      <td>
        <button onClick={handleSave}>Save</button>
      </td>
    </tr>
  )
}

function Table({ rows }) {
  return (
    <table>
      {rows.map((row) => (
        <ScopeProvider key={row.id} scopeId={row.id}>
          <TableRow row={row} />
        </ScopeProvider>
      ))}
    </table>
  )
}
```

