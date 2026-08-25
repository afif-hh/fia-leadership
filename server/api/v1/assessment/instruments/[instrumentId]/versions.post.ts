import { getRouterParam, readBody } from 'h3'
import * as z from 'zod/mini'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { createAssessmentRepository, getVersion } from '../../../../../domain/assessment/index.ts'

/**
 * Creates a version: blank for a v1, or a clone of a published/retired source (#49).
 *
 * Audit-classified — `assessment.version_created` is written inside the repository transaction —
 * so `audit: true` forces a fresh session rather than the ≤60s-stale cookie cache.
 */
const body = z.strictObject({ sourceVersionId: z.optional(z.string()) })

export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'create',
  domain: 'assessment',
  audit: true,
  handler: async (event, principal, { db }) => {
    const instrumentId = getRouterParam(event, 'instrumentId') ?? ''
    const input = body.parse((await readBody(event)) ?? {})

    const result = await createAssessmentRepository(db).createVersion({
      instrumentId,
      actorUserId: principal.userId,
      sourceVersionId: input.sourceVersionId,
    })

    return {
      version: await getVersion(db, result.versionId),
      clonedItemCount: result.clonedItemCount,
    }
  },
})
