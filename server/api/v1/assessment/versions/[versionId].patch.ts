import { getRouterParam, readBody } from 'h3'
import * as z from 'zod/mini'

import { definePolicyHandler } from '../../../../http/define-policy-handler.ts'
import {
  createAssessmentRepository,
  getVersionDetail,
} from '../../../../domain/assessment/index.ts'

/**
 * Edits a draft version's selection: add or remove an item, reorder, toggle `reverse_coded`.
 *
 * One endpoint rather than four, because the ledger (#50) emits these as the author types and a
 * single shape keeps the transport boring. A frozen version rejects every one of them with a 409
 * from `VersionFrozenError` — the trigger from #48 would abort the write anyway, and the guard is
 * what makes the refusal legible.
 */
const body = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('addItem'),
    itemId: z.string(),
    position: z.number(),
    reverseCoded: z.optional(z.boolean()),
  }),
  z.strictObject({ op: z.literal('removeItem'), itemId: z.string() }),
  z.strictObject({ op: z.literal('reorder'), orderedItemIds: z.array(z.string()) }),
  z.strictObject({
    op: z.literal('setReverseCoded'),
    itemId: z.string(),
    reverseCoded: z.boolean(),
  }),
])

export default definePolicyHandler({
  resource: 'assessmentConfiguration',
  action: 'update',
  domain: 'assessment',
  handler: async (event, _principal, { db }) => {
    const versionId = getRouterParam(event, 'versionId') ?? ''
    const input = body.parse(await readBody(event))
    const repo = createAssessmentRepository(db)

    switch (input.op) {
      case 'addItem':
        await repo.addVersionItem({
          versionId,
          itemId: input.itemId,
          position: input.position,
          reverseCoded: input.reverseCoded,
        })
        break
      case 'removeItem':
        await repo.removeVersionItem(versionId, input.itemId)
        break
      case 'reorder':
        await repo.reorderVersionItems(versionId, input.orderedItemIds)
        break
      case 'setReverseCoded':
        await repo.setReverseCoded(versionId, input.itemId, input.reverseCoded)
        break
    }

    return getVersionDetail(db, versionId)
  },
})
