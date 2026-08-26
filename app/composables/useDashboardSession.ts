import { computed } from 'vue'

/**
 * The principal and the navigation the server says they may see.
 *
 * The navigation is **not** computed here. The access matrix lives in
 * `server/domain/identity/policy.ts` and the server projects it — issue #22 sketched filtering in
 * the browser, which would have meant a second copy of the matrix in `app/`, the exact drift the
 * projection was meant to prevent.
 *
 * Nothing here is a security boundary. What this returns decides what is *drawn*; every route the
 * items point at is independently gated server-side, and a wrong answer here is a cosmetic bug.
 */

export interface VisibleNavItem {
  id: string
  label: string
  group: 'operate' | 'configure' | 'insight'
  to: string | null
  available: boolean
}

export interface DashboardPrincipal {
  userId: string
  email: string
  roles: string[]
  navigation: VisibleNavItem[]
}

export function useDashboardSession() {
  const { data, error, refresh } = useFetch<DashboardPrincipal>('/api/v1/me', {
    key: 'dashboard-me',
    // The server decides; a denial is a legitimate answer rather than a failure to retry.
    retry: false,
  })

  return {
    principal: computed(() => data.value ?? null),
    navigation: computed(() => data.value?.navigation ?? []),
    error,
    refresh,
  }
}

/**
 * The heading for a route, resolved from the navigation the server sent.
 *
 * Exact match first, then the **longest** matching prefix. The prefix arm is what a section with
 * child routes needs: `/dashboard/assessment/{id}` has no nav entry of its own, and with an
 * exact-only lookup every authoring screen's heading read "Dashboard" (#54). Longest rather than
 * first match, so a deeper section still wins over a shallower one listed earlier.
 *
 * A plain function, not a computed, so the precedence is testable without mounting the layout.
 */
export function resolvePageTitle(
  navigation: readonly VisibleNavItem[],
  path: string,
  fallback = 'Dashboard'
): string {
  const exact = navigation.find((item) => item.to === path)
  if (exact) return exact.label

  const prefixed = navigation
    .filter((item) => item.to && path.startsWith(`${item.to}/`))
    .sort((a, b) => (b.to?.length ?? 0) - (a.to?.length ?? 0))

  return prefixed[0]?.label ?? fallback
}
