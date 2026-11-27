import { requireSession } from '@navios/better-auth'
import { Controller, Endpoint, inject } from '@navios/server'

import type { HandlerParams, RequestContext } from '@navios/server'

import { createNote, getMe, listNotes } from './notes.api.mjs'
import { NotesService } from './notes.service.mjs'

/** Behind `BetterAuthGuard` (see `AppModule`): every handler has a session. */
@Controller()
export class NotesController {
  private readonly notes = inject(NotesService)

  @Endpoint(getMe)
  async me(_params: HandlerParams<typeof getMe>, ctx: RequestContext) {
    const { user } = await requireSession(ctx)
    // `plan` is typed: `Auth` is registered in `auth.mts`.
    return { id: user.id, email: user.email, plan: user.plan ?? 'free' }
  }

  @Endpoint(listNotes)
  async list(_params: HandlerParams<typeof listNotes>, ctx: RequestContext) {
    const { user } = await requireSession(ctx)
    return this.notes.list(user.id)
  }

  @Endpoint(createNote)
  async create({ data }: HandlerParams<typeof createNote>, ctx: RequestContext) {
    const { user } = await requireSession(ctx)
    return this.notes.create(user.id, data.text)
  }
}
