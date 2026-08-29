<script setup lang="ts">
/**
 * PROTOTYPE — throwaway route for issue #60 (The answering screen), child of the student-facing
 * assessment taking flow map (#57). Not a real route: no auth, no API, fake in-memory data.
 * Three structurally different answers to "one item per screen vs. one long page vs. blocks",
 * switchable via ?variant=. Hidden outside dev builds.
 *
 * A — one item per screen, strictly directional.
 * B — one long scrolling page, every item at once, free navigation via a jump map.
 * C — blocks of 3 items, directional between blocks (hybrid of A and B).
 */
import PrototypeSwitcher from '@/components/prototype/PrototypeSwitcher.vue'
import VariantA from '@/components/prototype/answering-screen/VariantA.vue'
import VariantB from '@/components/prototype/answering-screen/VariantB.vue'
import VariantC from '@/components/prototype/answering-screen/VariantC.vue'

definePageMeta({ layout: false })
useHead({ title: 'PROTOTYPE — Layar Menjawab Asesmen' })

if (import.meta.dev === false) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}

const variants = [
  { key: 'A', name: 'Satu per layar' },
  { key: 'B', name: 'Satu halaman panjang' },
  { key: 'C', name: 'Blok 3 pertanyaan' },
]

const route = useRoute()
const router = useRouter()
const variant = computed(() => {
  const q = route.query.variant
  return typeof q === 'string' && variants.some((v) => v.key === q) ? q : 'A'
})

function setVariant(key: string) {
  router.replace({ query: { ...route.query, variant: key } })
}
</script>

<template>
  <div>
    <VariantA v-if="variant === 'A'" :key="`A-${variant}`" />
    <VariantB v-else-if="variant === 'B'" :key="`B-${variant}`" />
    <VariantC v-else-if="variant === 'C'" :key="`C-${variant}`" />
    <PrototypeSwitcher :variants="variants" :current="variant" @change="setVariant" />
  </div>
</template>

<style>
/**
 * PROTOTYPE workaround, not a real fix. main.css's global reset —
 * `*, *::before, *::after { margin: 0; padding: 0; }` — is unlayered plain CSS, and unlayered
 * rules always win over Tailwind's utilities (which Tailwind puts inside `@layer utilities`)
 * regardless of specificity or source order. The practical effect: every padding/margin
 * utility in this app — bare Tailwind ones and the custom `-space-N` scale alike — currently
 * computes to zero everywhere, site-wide, not just here. Confirmed via computed-style checks
 * against the running dev server (2026-08-30); worth its own bug report against main.css, but
 * out of scope for this prototype. These class selectors have real specificity (unlike `*`), so
 * they win the same unlayered fight and let this throwaway page render as intended.
 */
.px-space-4 { padding-left: 16px; padding-right: 16px; }
.px-space-6 { padding-left: 24px; padding-right: 24px; }
.py-space-2 { padding-top: 8px; padding-bottom: 8px; }
.py-space-3 { padding-top: 12px; padding-bottom: 12px; }
.py-space-4 { padding-top: 16px; padding-bottom: 16px; }
.py-space-6 { padding-top: 24px; padding-bottom: 24px; }
.pt-space-6 { padding-top: 24px; }
.pb-space-2 { padding-bottom: 8px; }
.pb-space-4 { padding-bottom: 16px; }
.pb-space-6 { padding-bottom: 24px; }
.pb-space-24 { padding-bottom: 96px; }
.pb-space-40 { padding-bottom: 160px; }
.mb-space-2 { margin-bottom: 8px; }
.mb-space-3 { margin-bottom: 12px; }
.mb-space-4 { margin-bottom: 16px; }
.mt-space-1 { margin-top: 4px; }
.mt-space-2 { margin-top: 8px; }
.mt-space-3 { margin-top: 12px; }
.mt-space-4 { margin-top: 16px; }
.px-2 { padding-left: 8px; padding-right: 8px; }
.py-2 { padding-top: 8px; padding-bottom: 8px; }
</style>
