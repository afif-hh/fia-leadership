/**
 * The language assessment content is authored in.
 *
 * The authoring screens read the bank at this locale rather than at the reader's, and that is a
 * deliberate difference from every other screen. An author editing an item is editing the source
 * text; showing them a resolved English rendering would mean typing a correction into a
 * translation and expecting the original to change.
 *
 * Must equal `DEFAULT_LOCALE` in `server/db/schema/locale.ts` — the base row is the base row on
 * both sides. `translations.test.ts` fails if the two drift.
 */
export const BASE_CONTENT_LOCALE = 'id'

/** The languages a translation can be stored in: everything except the base. */
export const TRANSLATABLE_LOCALES = ['en'] as const
export type TranslatableLocale = (typeof TRANSLATABLE_LOCALES)[number]
