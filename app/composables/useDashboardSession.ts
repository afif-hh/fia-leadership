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
