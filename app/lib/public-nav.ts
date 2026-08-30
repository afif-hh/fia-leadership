/**
 * The public site's navigation, as data.
 *
 * `to: null` means the page in `docs/features/public-website.md`'s structure has not been built.
 * `PublicPlannedLink` renders those disabled rather than linking to a 404. Fill in the route when
 * the page lands and nothing else changes.
 *
 * This lives in a module rather than in `layouts/public.vue`'s script block so the link guard can
 * import it. Reading it out of the SFC as text was the earlier shape, and it did not work: the
 * layout binds `:to="link.to"` from this array, so a regex over the template matched none of it
 * and the guard stayed green with a dead link restored.
 *
 * `labelKey` names a message rather than being one. The site is bilingual, and a label written
 * here would be written in one language for every reader — the same rule
 * `server/http/dashboard-nav.ts` follows for the admin rail.
 */
export interface PublicNavLink {
  labelKey: string
  to: string | null
}

export const navLinks: PublicNavLink[] = [
  { labelKey: 'nav.knowledgeCenter', to: null },
  { labelKey: 'nav.programs', to: null },
  { labelKey: 'nav.research', to: null },
]

export const footerLinks: PublicNavLink[] = [
  { labelKey: 'footer.contact', to: null },
  { labelKey: 'footer.privacy', to: null },
]
