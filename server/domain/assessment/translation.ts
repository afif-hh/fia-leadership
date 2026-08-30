/**
 * The one rule that decides which language a student is actually reading.
 *
 * A stem and its anchor ladder are used together or not at all. Taking a translated question with
 * an untranslated ladder would put the question in one language and the answers in another, and on
 * a published version that can never be corrected (FR-005). Every read that can serve two
 * languages goes through `pair` so the rule is stated once rather than re-derived per call site.
 *
 * Why a function and not three inline checks: the halves reach each call site from different
 * places. In the frozen path both come from one `NOT NULL` row and cannot disagree; in the live
 * path they come from two independent joins and routinely do; at publish they come from two
 * lookups that may each miss. Naming the rule means a reader checks it once instead of three
 * times, and the compiler — rather than a non-null assertion — is what proves the halves belong
 * together.
 */
export interface TranslatedText {
  stem: string
  scalePoints: string
}

export function pair(
  stem: string | null | undefined,
  scalePoints: string | null | undefined
): TranslatedText | null {
  return stem != null && scalePoints != null ? { stem, scalePoints } : null
}
