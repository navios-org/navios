import { Authenticated, CurrentUser } from '@navios/better-auth'
import { Controller, Endpoint, inject } from '@navios/server'

import type { HandlerParams, RequestContext } from '@navios/server'

import { createNote, getMe, listNotes } from './notes.api.mjs'
import { NotesService } from './notes.service.mjs'

/** Every route needs a signed-in user, so the handlers read it without checking. */
@Authenticated()
@Controller()
export class NotesController {
  private readonly notes = inject(NotesService)

  @Endpoint(getMe)
  me(_params: HandlerParams<typeof getMe>, ctx: RequestContext) {
    const user = ctx.get(CurrentUser)
    // `plan` is typed: `Auth` is registered in `auth.mts`.
    return { id: user.id, email: user.email, plan: user.plan ?? 'free' }
  }

  @Endpoint(listNotes)
  list(_params: HandlerParams<typeof listNotes>, ctx: RequestContext) {
    return this.notes.list(ctx.get(CurrentUser).id)
  }

  @Endpoint(createNote)
  create({ data }: HandlerParams<typeof createNote>, ctx: RequestContext) {
    return this.notes.create(ctx.get(CurrentUser).id, data.text)
  }
}
