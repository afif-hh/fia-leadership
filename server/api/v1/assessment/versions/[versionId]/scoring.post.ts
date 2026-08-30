import { getRouterParam, readBody } from 'h3'
import * as z from 'zod/mini'

import { definePolicyHandler } from '../../../../../http/define-policy-handler.ts'
import { bandsSchema, createScoringVersion } from '../../../../../domain/assessment/index.ts'

const body = z.strictObject({
  bands: bandsSchema,
  weights: z.array(
    z.strictObject({
      dimensionId: z.string(),
      weight: z.number(),
    })
  ),
  taskAxisDimensionId: z.optional(z.nullable(z.string())),
  peopleAxisDimensionId: z.optional(z.nullable(z.string())),
})

/**
 * Drafts a formula. Maps to **Scoring Rules** / `draft`, which only Lab Admin holds — the
 * separation of duties `/CLAUDE.md` rule 1 rests on is expressed here as two different actions on
 * one row, not as two endpoints one role could reach both of.
 *
 * `audit: true`, so this also forces `requireFreshSession`: a role revoked in the last minute must
 * not still be able to write a formula, and rbac.md puts "Ubah scoring config" on the mandatory
 * audit list. The event carries ids and a rule count, never the weights.
 */
export default definePolicyHandler({
  resource: 'scoringRules',
  action: 'draft',
  domain: 'assessment',
  audit: true,
  handler: async (event, principal, { db }) => {
    const versionId = getRouterParam(event, 'versionId') ?? ''
    const input = body.parse(await readBody(event))
    return {
      scoringVersion: await createScoringVersion(db, {
        versionId,
        ...input,
        actorUserId: principal.userId,
      }),
    }
  },
})
