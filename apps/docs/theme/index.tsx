import { Layout as OriginalLayout } from '@rspress/core/theme-original'

import { Footer } from './Footer'

export function Layout() {
  return <OriginalLayout bottom={<Footer />} />
}

export * from '@rspress/core/theme-original'
