<script setup lang="ts">
/**
 * One number with its label, on the same Card foundation as everything else.
 *
 * The label is `CardDescription` and the number is `CardTitle`, which reads in that order and puts
 * the larger type on the value — the inverse of the `<dl>` this replaces, where the label was the
 * `<dt>` and had to be read first anyway. No heading: a grid of three metrics is not three
 * sections, and inserting `h2`s here would bury the real section heading above them.
 */
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

defineProps<{ label: string; value: number | string }>()
</script>

<template>
  <Card size="sm">
    <CardHeader>
      <CardDescription>{{ label }}</CardDescription>
      <CardTitle class="text-2xl font-semibold">{{ value }}</CardTitle>
    </CardHeader>
  </Card>
</template>
