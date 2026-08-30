import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

import SidebarProvider from '../../components/ui/sidebar/SidebarProvider.vue'
import { useSidebar } from '../../components/ui/sidebar/utils'

/**
 * The dashboard shell is server-rendered, and `useMediaQuery` has no viewport to measure on the
 * server: it returns false, so SSR always emits `Sidebar.vue`'s desktop branch. When `isMobile`
 * read the media query directly, a client narrower than 768px picked the `<Sheet>` branch on its
 * very first render, and Vue rebuilt the whole sidebar subtree with "Hydration node mismatch" —
 * on /dashboard, /dashboard/users, /dashboard/audit and both assessment routes.
 *
 * The invariant that prevents it: the first client render may not depend on the viewport. Whether
 * it later swaps to the sheet is a normal reactive update and is not what these assert.
 */

const setViewport = (matches: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

/** Reads `isMobile` out of the provided context and records it on every render. */
const probe = (seen: boolean[]) =>
  defineComponent({
    setup() {
      const { isMobile } = useSidebar()
      return () => {
        seen.push(isMobile.value)
        return h('div')
      }
    },
  })

const originalMatchMedia = window.matchMedia

describe('SidebarProvider isMobile', () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  beforeEach(() => {
    setViewport(true)
  })

  it('is false on the first render even on a mobile viewport', () => {
    const seen: boolean[] = []
    mount(SidebarProvider, { slots: { default: () => h(probe(seen)) } })

    // The server rendered the desktop branch. If this is true, the client disagrees with the
    // markup it is hydrating and Vue throws the subtree away.
    expect(seen[0]).toBe(false)
  })

  it('becomes true after mount, so the sheet still appears on a phone', async () => {
    const seen: boolean[] = []
    mount(SidebarProvider, { slots: { default: () => h(probe(seen)) } })
    await nextTick()

    expect(seen.at(-1)).toBe(true)
  })

  it('stays false on a desktop viewport', async () => {
    setViewport(false)
    const seen: boolean[] = []
    mount(SidebarProvider, { slots: { default: () => h(probe(seen)) } })
    await nextTick()

    expect(seen).not.toContain(true)
  })
})
