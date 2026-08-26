import { describe, it, expect } from 'vitest'

import { resolvePageTitle, type VisibleNavItem } from '../../composables/useDashboardSession'

/**
 * Guards the heading precedence in `layouts/dashboard.vue` (#54).
 *
 * The layout used to resolve its heading by exact route match only, so `/dashboard/assessment/{id}`
 * — which has no navigation entry of its own — fell through to the literal string "Dashboard" on
 * every authoring screen. Found by opening the page; nothing failed.
 */

const nav = (entries: [string, string | null][]): VisibleNavItem[] =>
  entries.map(([label, to], index) => ({
    id: `item-${index}`,
    label,
    group: 'configure',
    to,
    available: to !== null,
  }))

describe('resolvePageTitle', () => {
  it('prefers an exact match', () => {
    const navigation = nav([
      ['Overview', '/dashboard'],
      ['Assessment configuration', '/dashboard/assessment'],
    ])
    expect(resolvePageTitle(navigation, '/dashboard/assessment')).toBe('Assessment configuration')
    expect(resolvePageTitle(navigation, '/dashboard')).toBe('Overview')
  })

  /** The regression: a child route inherits its section rather than the fallback. */
  it('falls back to the parent section for a nested route', () => {
    const navigation = nav([
      ['Overview', '/dashboard'],
      ['Assessment configuration', '/dashboard/assessment'],
    ])
    expect(resolvePageTitle(navigation, '/dashboard/assessment/abc-123')).toBe(
      'Assessment configuration'
    )
  })

  it('picks the longest matching prefix, not the first listed', () => {
    // `/dashboard` also prefixes this path, and is listed first. The deeper section has to win, or
    // every child route in the app reads "Overview".
    const navigation = nav([
      ['Overview', '/dashboard'],
      ['Assessment configuration', '/dashboard/assessment'],
    ])
    expect(resolvePageTitle(navigation, '/dashboard/assessment/abc/versions/1')).toBe(
      'Assessment configuration'
    )
  })

  it('requires a path separator, so a sibling route is not treated as a child', () => {
    // `/dashboard/assessments` must not resolve to `/dashboard/assessment`'s label.
    const navigation = nav([['Assessment configuration', '/dashboard/assessment']])
    expect(resolvePageTitle(navigation, '/dashboard/assessments')).toBe('Dashboard')
  })

  it('ignores entries with no route', () => {
    const navigation = nav([
      ['Scoring rules', null],
      ['Assessment configuration', '/dashboard/assessment'],
    ])
    expect(resolvePageTitle(navigation, '/dashboard/assessment/abc')).toBe(
      'Assessment configuration'
    )
  })

  it('falls back when nothing matches, and lets the caller name the fallback', () => {
    expect(resolvePageTitle(nav([]), '/dashboard/anything')).toBe('Dashboard')
    expect(resolvePageTitle(nav([]), '/dashboard/anything', 'Lab')).toBe('Lab')
  })
})
