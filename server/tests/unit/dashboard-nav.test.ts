import { describe, expect, it } from 'vitest'

import { NAV_ITEMS, visibleNavItems } from '../../http/dashboard-nav.ts'
import { authorize } from '../../domain/identity/policy.ts'
import { ROLE_CODES } from '../../db/schema/identity.ts'

/**
 * The rail is a projection of the access matrix (issue #22). These assert it stays one — that the
 * navigation cannot grant something the matrix denies, and cannot quietly outlive a permission.
 */
describe('navigation is a projection of the matrix', () => {
  it('shows a Lab Admin every item, since the matrix permits all nine resources', () => {
    const visible = visibleNavItems(['lab_admin'])
    expect(visible.map((i) => i.id)).toEqual(NAV_ITEMS.map((i) => i.id))
  })

  it('shows a signed-in user with no roles nothing at all', () => {
    expect(visibleNavItems([])).toEqual([])
  })

  it('never shows an item whose cell denies its action', () => {
    // The property that matters: no nav item can appear for a role the matrix refuses. If this
    // fails, the rail has stopped being a projection and become a second list.
    for (const role of ROLE_CODES) {
      const visibleIds = new Set(visibleNavItems([role]).map((i) => i.id))
      for (const item of NAV_ITEMS) {
        if (!visibleIds.has(item.id)) continue
        // Present means not denied. Scoped counts as visible on purpose — see below.
        // Re-derived rather than trusting the filter under test. Scoped counts as visible on
        // purpose — see the next case.
        expect(['allow', 'scoped'], `${role} sees ${item.id}`).toContain(
          authorize([role], item.resource, item.action)
        )
      }
    }
  })

  it('keeps scoped items visible, because the client cannot resolve them', () => {
    // A researcher's Aggregate Dashboard cell is R*. Hiding on a guess would be worse than showing
    // an item whose route then denies precisely; the predicate needs a database read and a target.
    const visible = visibleNavItems(['researcher']).map((i) => i.id)
    expect(visible).toContain('aggregate')
  })

  it('does not leak resource or action to the client', () => {
    // Shipping them would invite someone to re-implement the decision in the browser, which is
    // the drift the server-side projection exists to prevent.
    for (const item of visibleNavItems(['lab_admin'])) {
      expect(item).not.toHaveProperty('resource')
      expect(item).not.toHaveProperty('action')
    }
  })

  it('leaves Own Profile and Own Assessment out of the rail', () => {
    // They belong in the user dropdown: the admin's own records, not administrative surfaces.
    const labels = NAV_ITEMS.map((i) => i.label)
    expect(labels).not.toContain('Own Profile')
    expect(labels).not.toContain('My assessment')
  })

  it('gives every unavailable item no route, so nothing can link to a page that does not exist', () => {
    for (const item of NAV_ITEMS) {
      if (!item.available) expect(item.to, item.id).toBeNull()
      else expect(item.to, item.id).toBeTruthy()
    }
  })
})
