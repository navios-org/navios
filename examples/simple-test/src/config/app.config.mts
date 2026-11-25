import { envInt, provideConfig } from '@navios/server'

export const AppConfig = provideConfig({
  load: () => ({
    port: envInt('PORT', 4250),
  }),
})
