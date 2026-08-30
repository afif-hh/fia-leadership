import { definePolicyHandler } from '../../../../http/define-policy-handler.ts'
import { readProfileView } from '../../../../domain/profile/index.ts'
import { requestLocale } from '../../../../http/request-locale.ts'

/**
 * The caller's current leadership profile: the newest snapshot, served verbatim.
 *
 * Maps to **Own Profile** / `read`, whose student cell is `CRUD`. The row is filtered by
 * `principal.userId` rather than by a scope predicate, for the reason the taking flow filters its
 * own: an unconditional allow never reaches `resolveScope`, so ownership is the query's job.
 *
 * `profile: null` rather than a 404 when nothing has been scored yet. Having no profile is the
 * ordinary state of every student before their first assessment, not a missing resource, and
 * `awaitingScore` tells that apart from a finished assessment with no approved formula.
 */
export default definePolicyHandler({
  resource: 'ownProfile',
  action: 'read',
  domain: 'profile',
  handler: async (event, principal, { db }) =>
    readProfileView(db, { userId: principal.userId, locale: requestLocale(event) }),
})
