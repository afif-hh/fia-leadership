import { definePolicyHandler } from '../../../../http/define-policy-handler.ts'
import { getCurrentProfile } from '../../../../domain/profile/index.ts'
import { getInstrument, getVersion } from '../../../../domain/assessment/index.ts'
import { requestLocale } from '../../../../http/request-locale.ts'

/**
 * The caller's current leadership profile: the newest snapshot, served verbatim.
 *
 * Maps to **Own Profile** / `read`, whose student cell is `CRUD`. The row is filtered by
 * `principal.userId` here rather than by a scope predicate, for the reason the taking flow filters
 * its own: an unconditional allow never reaches `resolveScope`, so ownership is the query's job.
 *
 * `null` rather than a 404 when nothing has been scored yet. Having no profile is the ordinary
 * state of every student before their first assessment, not a missing resource, and the page that
 * renders this needs to tell those two apart.
 *
 * The instrument name is fetched alongside, through the `assessment` domain's public entrypoint —
 * the snapshot stores version ids, never display text, so that a later translation of an
 * instrument's name cannot appear to change a frozen report.
 */
export default definePolicyHandler({
  resource: 'ownProfile',
  action: 'read',
  domain: 'profile',
  handler: async (event, principal, { db }) => {
    const profile = await getCurrentProfile(db, principal.userId)
    if (!profile) return { profile: null, assessment: null }

    const locale = requestLocale(event)
    const version = await getVersion(db, profile.assessmentVersionId)
    const instrument = await getInstrument(db, version.instrumentId, locale)

    return {
      profile,
      assessment: { instrumentName: instrument.name, versionNo: version.versionNo },
    }
  },
})
