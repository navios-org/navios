import { envInt } from '@navios/core'

export function configureConfig() {
  return {
    port: envInt('PORT', 4250),
  }
}
