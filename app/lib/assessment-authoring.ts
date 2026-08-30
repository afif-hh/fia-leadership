/**
 * Pure derivations behind the assessment authoring screen (#54).
 *
 * The ledger, the matrix and the publish gate each render one of these. They live here rather
 * than inside the components so the rules are testable without mounting anything, and so the
 * three views cannot disagree about what "changed", "unmapped" or "ready to publish" means.
 *
 * Response shapes are declared locally rather than imported from `server/domain/assessment`:
 * `docs/architecture/api-design.md` is the contract between the two, and importing across the
 * app/server line would make the UI depend on a domain's internals.
 */

export type VersionStatus = 'draft' | 'review' | 'published' | 'retired'
export type DimensionKind = 'domain' | 'style' | 'axis'

export interface ItemDimension {
  id: string
  code: string
  kind: DimensionKind | null
}

export interface VersionItem {
  versionItemId: string
  itemId: string
  code: string
  position: number
  reverseCoded: boolean
  stem: string
  scalePoints: unknown
  scaleCode: string | null
  dimensions: ItemDimension[]
}

export interface VersionDetail {
  id: string
  instrumentId: string
  versionNo: number
  status: VersionStatus
  publishedAt: string | null
  retiredAt: string | null
  sourceVersionId: string | null
  frozen: boolean
  items: VersionItem[]
}

export interface VersionDiff {
  versionId: string
  sourceVersionId: string | null
  blank: boolean
  added: { itemId: string; code: string; position: number }[]
  removed: { itemId: string; code: string; position: number }[]
  moved: { itemId: string; code: string; from: number; to: number }[]
  reverseCodingChanged: { itemId: string; code: string; from: boolean; to: boolean }[]
  stemChanged: { itemId: string; code: string; before: string; after: string }[]
  totalChanges: number
}

export interface Dimension {
  id: string
  code: string
  name: string
  kind: DimensionKind
  description: string | null
}

/* ------------------------------------------------------------------ the ledger's diff column --- */

/** The diff categories that can apply to one row. `removed` is not here — a removed item is by
 * definition absent from the selection the ledger renders. */
export type ItemChange = 'added' | 'moved' | 'reverseCoding' | 'stem'

/**
 * The diff must be conveyed **in text**, not by colour alone — WCAG 2.2 AA and #54's definition of
 * done both require it, so the label is the primary carrier and any styling is decoration on top.
 * The words themselves live in the message files under `authoring.change.*`; this module stays
 * language-free so the same map can be rendered in either locale.
 */

/**
 * Which changes apply to each item, keyed by `itemId`.
 *
 * An item can carry several at once — reworded *and* moved is ordinary — so this is a list per
 * item rather than a single tag. A version with no source (`blank`) yields an empty map: there is
 * nothing to have changed from.
 */
export function changesByItem(diff: VersionDiff | null | undefined): Map<string, ItemChange[]> {
  const map = new Map<string, ItemChange[]>()
  if (!diff || diff.blank) return map

  const push = (itemId: string, change: ItemChange) => {
    const existing = map.get(itemId)
    if (existing) existing.push(change)
    else map.set(itemId, [change])
  }

  for (const row of diff.added) push(row.itemId, 'added')
  for (const row of diff.moved) push(row.itemId, 'moved')
  for (const row of diff.reverseCodingChanged) push(row.itemId, 'reverseCoding')
  for (const row of diff.stemChanged) push(row.itemId, 'stem')

  return map
}

/* ------------------------------------------------------------------------- the matrix view --- */

export interface DimensionCoverage {
  dimension: Dimension
  itemCount: number
  /** A dimension no item measures produces no score at all (#50). */
  unmapped: boolean
}

export function dimensionCoverage(
  dimensions: readonly Dimension[],
  items: readonly VersionItem[]
): DimensionCoverage[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    for (const dimension of item.dimensions) {
      counts.set(dimension.id, (counts.get(dimension.id) ?? 0) + 1)
    }
  }

  return dimensions.map((dimension) => {
    const itemCount = counts.get(dimension.id) ?? 0
    return { dimension, itemCount, unmapped: itemCount === 0 }
  })
}

/** True when `item` measures `dimensionId` — the matrix's cell test. */
export function itemMeasures(item: VersionItem, dimensionId: string): boolean {
  return item.dimensions.some((dimension) => dimension.id === dimensionId)
}

/* -------------------------------------------------------------------------- the publish gate --- */

/**
 * One reason publish is not available.
 *
 * A discriminated union carrying the *facts*, not a sentence. The sentence is rendered by
 * `PublishReview.vue` from `authoring.publish.blocker.<code>`, in the author's language — a
 * message composed here would be composed in one language for every author.
 */
export type PublishBlocker =
  | { code: 'frozen'; status: 'published' | 'retired' }
  | { code: 'wrong-status' }
  | { code: 'no-items' }
  | { code: 'unmapped-items'; itemCodes: string[] }
  | { code: 'not-acknowledged' }

export interface PublishGate {
  blockers: PublishBlocker[]
  /** Item codes carrying no dimension at all. Surfaced before the attempt, not discovered as a
   * failure — the whole point of showing the gate on screen (#50). */
  unmappedItemCodes: string[]
  /** What the acknowledgement has to name (#49, #50). */
  changeCount: number
  armed: boolean
}

export interface PublishGateInput {
  version: VersionDetail | null | undefined
  diff: VersionDiff | null | undefined
  /** Whether the author has ticked the acknowledgement naming the change count. */
  acknowledged: boolean
}

/**
 * Everything standing between this version and `published`.
 *
 * Mirrors the server's own gate rather than replacing it: the trigger from #48 and the service
 * guard from #52 are the real enforcement, and the UI is not a security boundary (CLAUDE.md §6).
 * This exists so the author sees *why* before pressing the button, which is the difference between
 * a gate and an error.
 */
export function publishGate({ version, diff, acknowledged }: PublishGateInput): PublishGate {
  const blockers: PublishBlocker[] = []
  const items = version?.items ?? []

  const unmappedItemCodes = items
    .filter((item) => item.dimensions.length === 0)
    .map((item) => item.code)

  if (!version) {
    return { blockers, unmappedItemCodes, changeCount: 0, armed: false }
  }

  if (version.frozen) {
    blockers.push({
      code: 'frozen',
      status: version.status === 'published' ? 'published' : 'retired',
    })
  } else if (version.status !== 'review') {
    // `draft → published` is not a legal transition (#47, #52): review comes first.
    blockers.push({ code: 'wrong-status' })
  }

  if (items.length === 0) {
    blockers.push({ code: 'no-items' })
  }

  if (unmappedItemCodes.length > 0) {
    blockers.push({ code: 'unmapped-items', itemCodes: unmappedItemCodes })
  }

  const changeCount = diff && !diff.blank ? diff.totalChanges : 0

  if (!acknowledged) {
    blockers.push({ code: 'not-acknowledged' })
  }

  return { blockers, unmappedItemCodes, changeCount, armed: blockers.length === 0 }
}

/* --------------------------------------------------------------------------- bulk paste path --- */

export interface ParsedPasteRow {
  code: string
  stem: string
}

export interface ParsedPaste {
  rows: ParsedPasteRow[]
  /** 1-based input line numbers that could not be parsed, so the author can fix them in place. */
  rejectedLines: number[]
}

/**
 * Parses the bulk-paste box used for KDPGK v1's first load (#50).
 *
 * Accepts `code<TAB>stem` or `code,stem`, one item per line — the two shapes a spreadsheet
 * produces. Tab is tried first: a stem legitimately contains commas, so splitting on comma first
 * would corrupt every such row.
 *
 * Blank lines are skipped rather than rejected; a trailing newline is not an error. Unparseable
 * lines are reported by number rather than dropped silently, because dropping one during a
 * 60-item first load is exactly the failure that would go unnoticed.
 */
export function parseBulkPaste(input: string): ParsedPaste {
  const rows: ParsedPasteRow[] = []
  const rejectedLines: number[] = []

  input.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === '') return

    const separator = line.includes('\t') ? '\t' : ','
    const at = line.indexOf(separator)
    if (at <= 0) {
      rejectedLines.push(index + 1)
      return
    }

    const code = line.slice(0, at).trim()
    const stem = line.slice(at + 1).trim()
    if (code === '' || stem === '') {
      rejectedLines.push(index + 1)
      return
    }

    rows.push({ code, stem })
  })

  return { rows, rejectedLines }
}

/** The engine holds a format CHECK on every `code` column; this mirrors it so the author is told
 * before the request rather than by a 422. See `server/db/schema/assessment.ts`. */
export function isValidCode(code: string): boolean {
  return code.length > 0 && /^[a-z0-9_]+$/.test(code)
}
