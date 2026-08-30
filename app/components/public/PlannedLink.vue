<script setup lang="ts">
/**
 * A destination in the public site's information architecture that may not have a page yet.
 *
 * `docs/features/public-website.md` fixes the structure — About, Programs, Research, Knowledge
 * Center, Contact — but only the homepage and the portal exist so far. Linking to the rest anyway
 * gave the visitor a 404 on every nav item and footer link, and made vue-router log
 * `VUE_ROUTER_R0004` for each of them during SSR and again on the client.
 *
 * With `to`, this is an ordinary link. Without one, it renders the same affordance disabled and
 * labelled "Later" — the pattern `app/layouts/dashboard.vue` already uses, so the page keeps the
 * shape of the finished product and grows by filling in rather than by redesign (issue #22).
 *
 * `aria-disabled` and the visible label are both required: a greyed item carrying no programmatic
 * state does not exist for assistive technology, and colour alone fails WCAG 2.2 AA.
 */
import type { HTMLAttributes } from 'vue'

import { cn } from '@/lib/utils'

const props = defineProps<{
  to?: string | null
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <NuxtLink v-if="props.to" :to="props.to" :class="props.class">
    <slot />
  </NuxtLink>

  <span
    v-else
    :aria-disabled="true"
    :class="cn('cursor-not-allowed opacity-60 gap-space-2', props.class)"
  >
    <slot />
    <span class="font-label-mono text-label-mono">Later</span>
  </span>
</template>
