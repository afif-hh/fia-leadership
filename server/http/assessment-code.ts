import * as z from 'zod/mini'

import { ASSESSMENT_CODE_PATTERN } from '../db/schema/assessment.ts'

/**
 * The `code` field shared by the four bank-creation endpoints (instrument, dimension, scale, item).
 *
 * One definition rather than four copies of `z.string()`: each of those tables carries the same
 * format CHECK, so every endpoint that took a bare string turned a typo into a 500. `mapDomainError`
 * already renders a zod failure as a 422 with `fields`, so validating here is the whole fix.
 *
 * The message names the rule instead of echoing the value — an error body never reflects request
 * content back (PII-RULE, and `domain-errors.ts` makes the same choice for item codes).
 */
export const assessmentCodeSchema = z.string().check(
  z.regex(ASSESSMENT_CODE_PATTERN, {
    error: 'A code may contain only lowercase letters, digits and underscores.',
  })
)
