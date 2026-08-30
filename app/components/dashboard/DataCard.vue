<script setup lang="ts">
/**
 * The Card foundation every dashboard data surface sits on.
 *
 * shadcn's `CardTitle` renders a `<div>`, which is right for a marketing card and wrong here: the
 * dashboard's sections are landmarks a screen-reader user navigates by heading, and the pages this
 * replaces all carried a real `<h2 id>` plus `aria-labelledby` on the surrounding `<section>`.
 * This wrapper keeps both — a heading of the caller's chosen level inside `CardTitle`, and the
 * `aria-labelledby` wiring done once here instead of an id invented per page.
 */
import { useId } from 'vue'

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

withDefaults(
  defineProps<{
    title: string
    description?: string
    /** Heading level for the title. The dashboard layout owns `h1`, so sections start at 2. */
    level?: 2 | 3
    /** Set when the slot is a `<table>`, which brings its own padding and edge-to-edge rules. */
    flush?: boolean
  }>(),
  { description: undefined, level: 2, flush: false }
)

const headingId = useId()
</script>

<template>
  <section :aria-labelledby="headingId">
    <Card>
      <CardHeader>
        <CardTitle>
          <component :is="`h${level}`" :id="headingId" class="text-base font-medium">
            {{ title }}
          </component>
        </CardTitle>
        <CardDescription v-if="description || $slots.description">
          <slot name="description">{{ description }}</slot>
        </CardDescription>
        <CardAction v-if="$slots.action">
          <slot name="action" />
        </CardAction>
      </CardHeader>

      <!-- A table brings its own cell padding (`px-2`), so the content box drops to `px-2` and the
           two add up to the `px-4` the header uses. Zero here would leave the columns hanging
           two pixels left of the title. -->
      <CardContent :class="flush ? 'px-2' : undefined">
        <slot />
      </CardContent>

      <CardFooter v-if="$slots.footer">
        <slot name="footer" />
      </CardFooter>
    </Card>
  </section>
</template>
