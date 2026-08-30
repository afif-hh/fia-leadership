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
 * `role="link"` is what carries the `aria-disabled`. Without a role there is no widget for the
 * attribute to modify and assistive technology drops it, which is what the first version did while
 * claiming the opposite: the item was announced as plain text and only the visible "Later" label
 * did any work. Colour alone fails WCAG 2.2 AA, so the label stays regardless.
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

  <!--
    The component's own classes go last so they win the merge. Passed first, `cursor-not-allowed`
    was silently deleted by tailwind-merge in favour of the footer's `cursor-pointer`, leaving a
    disabled item that showed a pointer. `pointer-events-none` retires the whole question: every
    call site still passes hover rules written when these were links, and this makes them
    unreachable rather than asking four files to stop passing them.
  -->
  <span
    v-else
    role="link"
    :aria-disabled="true"
    :class="cn(props.class, 'cursor-not-allowed opacity-60 pointer-events-none')"
  >
    <slot />
    <span class="font-label-mono text-label-mono">Later</span>
  </span>
</template>
