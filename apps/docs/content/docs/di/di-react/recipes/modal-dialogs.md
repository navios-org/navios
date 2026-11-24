---
sidebar_position: 5
---

# Modal Dialogs

This recipe demonstrates how to use `ScopeProvider` to create isolated service instances for modal dialogs.

## Isolated Modal Services

```tsx
import { Injectable, InjectableScope } from '@navios/di'
import { ScopeProvider, useService } from '@navios/di-react'

@Injectable({ scope: InjectableScope.Request })
class ModalService {
  private isOpen = false

  open() {
    this.isOpen = true
  }

  close() {
    this.isOpen = false
  }

  getIsOpen() {
    return this.isOpen
  }
}

function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null

  return (
    <ScopeProvider scopeId={`modal-${Date.now()}`}>
      <ModalDialog onClose={onClose}>{children}</ModalDialog>
    </ScopeProvider>
  )
}

function ModalDialog({ onClose, children }) {
  const { data: modalService } = useService(ModalService)

  useEffect(() => {
    modalService?.open()
    return () => {
      modalService?.close()
    }
  }, [modalService])

  return (
    <div className="modal">
      <button onClick={onClose}>Close</button>
      {children}
    </div>
  )
}
```

