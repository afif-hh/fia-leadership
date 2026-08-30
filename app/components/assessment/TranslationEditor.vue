<script setup lang="ts">
/**
 * The translation tab: every piece of authored content beside its translation.
 *
 * Side by side rather than a language toggle over the ledger, because translating is a comparison
 * — you cannot check a rendering you cannot see the original of. It is also why the base column is
 * plain text and not an input: this screen edits the translation, and the ledger edits the source.
 *
 * A scale's anchors are edited as the whole ladder. Translating one rung without the others is how
 * a scale stops measuring what it measured, so the form does not offer that shape at all.
 *
 * Emits intent; the page owns persistence, like every other component here.
 */
import { computed, ref, watch } from 'vue'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TRANSLATABLE_LOCALES, type TranslatableLocale } from '@/lib/content-locale'
import type { Dimension, VersionItem } from '@/lib/assessment-authoring'

export interface ScaleRow {
  id: string
  code: string
  name: string
  points: unknown
}

export interface InstrumentTranslations {
  locale: string
  instrument: { name: string; description: string | null } | null
  items: { itemId: string; stem: string }[]
  scales: { scaleId: string; name: string; points: unknown }[]
  dimensions: { dimensionId: string; name: string; description: string | null }[]
}

const props = defineProps<{
  locale: TranslatableLocale
  instrument: { id: string; code: string; name: string } | null
  items: VersionItem[]
  scales: ScaleRow[]
  dimensions: Dimension[]
  translations: InstrumentTranslations | null
  busy?: boolean
}>()

const emit = defineEmits<{
  selectLocale: [TranslatableLocale]
  saveItem: [{ itemId: string; stem: string }]
  saveScale: [{ scaleId: string; name: string; points: { value: number; label: string }[] }]
  saveDimension: [{ dimensionId: string; name: string }]
  saveInstrument: [{ name: string }]
}>()

const { t, locales } = useI18n()

/** The reader-facing name of each translatable language, taken from the i18n config. */
const localeOptions = computed(() =>
  TRANSLATABLE_LOCALES.map((code) => ({
    code,
    name: locales.value.find((entry) => entry.code === code)?.name ?? code,
  }))
)

interface Drafts {
  items: Record<string, string>
  scaleNames: Record<string, string>
  scalePoints: Record<string, { value: number; label: string }[]>
  dimensions: Record<string, string>
  instrumentName: string
}

/**
 * Draft state for every row, rebuilt whole whenever the target language changes.
 *
 * One object replaced rather than four maps mutated in place: switching languages must not carry
 * one language's half-typed text into the other and then save it there, and rebuilding is the
 * only version of that which cannot leave a stale key behind.
 */
const drafts = ref<Drafts>({
  items: {},
  scaleNames: {},
  scalePoints: {},
  dimensions: {},
  instrumentName: '',
})

function anchorsOf(points: unknown): { value: number; label: string }[] {
  if (!Array.isArray(points)) return []
  return points.flatMap((point) =>
    point && typeof point === 'object' && 'value' in point && 'label' in point
      ? [
          {
            value: Number((point as { value: unknown }).value),
            label: String((point as { label: unknown }).label),
          },
        ]
      : []
  )
}

watch(
  () => [props.locale, props.translations] as const,
  () => {
    const stored = props.translations
    const next: Drafts = {
      items: {},
      scaleNames: {},
      scalePoints: {},
      dimensions: {},
      instrumentName: stored?.instrument?.name ?? '',
    }

    for (const item of props.items) {
      next.items[item.itemId] = stored?.items.find((row) => row.itemId === item.itemId)?.stem ?? ''
    }
    for (const scale of props.scales) {
      const translated = stored?.scales.find((row) => row.scaleId === scale.id)
      next.scaleNames[scale.id] = translated?.name ?? ''
      // The ladder starts from the source anchors so the values are already right and only the
      // labels need typing. Values are shown read-only: changing one changes what the scale
      // measures, not how it reads.
      const translatedPoints = anchorsOf(translated?.points)
      next.scalePoints[scale.id] = anchorsOf(scale.points).map((point) => ({
        value: point.value,
        label: translatedPoints.find((row) => row.value === point.value)?.label ?? '',
      }))
    }
    for (const dimension of props.dimensions) {
      next.dimensions[dimension.id] =
        stored?.dimensions.find((row) => row.dimensionId === dimension.id)?.name ?? ''
    }

    drafts.value = next
  },
  { immediate: true, deep: false }
)

const translatedItemCount = computed(
  () => props.items.filter((item) => (drafts.value.items[item.itemId] ?? '').trim() !== '').length
)

function scaleReady(scaleId: string): boolean {
  const anchors = drafts.value.scalePoints[scaleId] ?? []
  return (
    (drafts.value.scaleNames[scaleId] ?? '').trim() !== '' &&
    anchors.length > 0 &&
    anchors.every((anchor) => anchor.label.trim() !== '')
  )
}
</script>

<template>
  <div class="flex flex-col gap-6" data-testid="translation-editor">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <p class="text-muted-foreground max-w-2xl text-sm">
        {{ t('authoring.translation.lead') }}
      </p>
      <label class="text-xs">
        <span class="sr-only">{{ t('authoring.translation.chooseLocale') }}</span>
        <select
          :value="locale"
          class="border-border h-8 rounded-md border bg-transparent px-2 text-xs"
          @change="
            emit('selectLocale', ($event.target as HTMLSelectElement).value as TranslatableLocale)
          "
        >
          <option v-for="option in localeOptions" :key="option.code" :value="option.code">
            {{ option.name }}
          </option>
        </select>
      </label>
    </div>

    <!-- Progress in text, and as a count rather than a bar: a partly translated instrument is a
         normal state, not a warning, and the number is what tells an author where they are. -->
    <p class="text-muted-foreground text-sm" role="status">
      {{ t('authoring.translation.progress', { done: translatedItemCount, total: items.length }) }}
    </p>

    <section aria-labelledby="translation-instrument-heading" class="flex flex-col gap-2">
      <h3 id="translation-instrument-heading" class="text-sm font-medium">
        {{ t('authoring.translation.instrumentHeading') }}
      </h3>
      <div class="flex flex-wrap items-end gap-2">
        <p class="text-muted-foreground min-w-56 text-sm">{{ instrument?.name ?? '—' }}</p>
        <Input
          v-model="drafts.instrumentName"
          :aria-label="t('authoring.translation.instrumentName')"
          class="h-9 w-72"
        />
        <Button
          size="sm"
          :disabled="busy || drafts.instrumentName.trim() === ''"
          @click="emit('saveInstrument', { name: drafts.instrumentName.trim() })"
        >
          {{ t('common.save') }}
        </Button>
      </div>
    </section>

    <section aria-labelledby="translation-items-heading" class="flex flex-col gap-2">
      <h3 id="translation-items-heading" class="text-sm font-medium">
        {{ t('authoring.translation.itemsHeading') }}
      </h3>
      <table class="w-full text-sm" data-testid="translation-items">
        <caption class="text-muted-foreground pb-2 text-left text-sm">
          {{
            t('authoring.translation.itemsCaption')
          }}
        </caption>
        <thead>
          <tr class="border-border border-b text-left">
            <th scope="col" class="py-2 font-medium">{{ t('authoring.ledger.code') }}</th>
            <th scope="col" class="py-2 font-medium">{{ t('authoring.translation.source') }}</th>
            <th scope="col" class="py-2 font-medium">{{ t('authoring.translation.target') }}</th>
            <th scope="col" class="py-2 font-medium">
              <span class="sr-only">{{ t('authoring.ledger.actions') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!items.length">
            <td colspan="4" class="text-muted-foreground py-3">
              {{ t('authoring.translation.noItems') }}
            </td>
          </tr>
          <tr v-for="item in items" :key="item.itemId" class="border-border border-b align-top">
            <th scope="row" class="py-2 font-mono text-xs font-normal">{{ item.code }}</th>
            <td class="py-2" :lang="'id'">{{ item.stem }}</td>
            <td class="py-2">
              <Input
                v-model="drafts.items[item.itemId]"
                :lang="locale"
                :aria-label="t('authoring.translation.itemStemFor', { code: item.code })"
                class="h-8 w-full"
              />
            </td>
            <td class="py-2 text-right">
              <Button
                size="xs"
                :disabled="busy || (drafts.items[item.itemId] ?? '').trim() === ''"
                @click="
                  emit('saveItem', {
                    itemId: item.itemId,
                    stem: (drafts.items[item.itemId] ?? '').trim(),
                  })
                "
              >
                {{ t('common.save') }}
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section aria-labelledby="translation-scales-heading" class="flex flex-col gap-3">
      <h3 id="translation-scales-heading" class="text-sm font-medium">
        {{ t('authoring.translation.scalesHeading') }}
      </h3>
      <p class="text-muted-foreground text-xs">{{ t('authoring.translation.scalesLead') }}</p>

      <fieldset
        v-for="scale in scales"
        :key="scale.id"
        class="border-border flex flex-col gap-2 rounded-md border p-3"
      >
        <legend class="font-mono text-xs">{{ scale.code }}</legend>
        <div class="flex flex-wrap items-end gap-2">
          <p class="text-muted-foreground min-w-40 text-sm">{{ scale.name }}</p>
          <Input
            v-model="drafts.scaleNames[scale.id]"
            :lang="locale"
            :aria-label="t('authoring.translation.scaleNameFor', { code: scale.code })"
            class="h-8 w-56"
          />
        </div>
        <div
          v-for="(anchor, index) in drafts.scalePoints[scale.id] ?? []"
          :key="anchor.value"
          class="flex flex-wrap items-center gap-2"
        >
          <span class="w-8 font-mono text-xs">{{ anchor.value }}</span>
          <span class="text-muted-foreground min-w-40 text-sm">
            {{ anchorsOf(scale.points)[index]?.label ?? '—' }}
          </span>
          <Input
            v-model="anchor.label"
            :lang="locale"
            :aria-label="
              t('authoring.translation.anchorLabelFor', { code: scale.code, value: anchor.value })
            "
            class="h-8 w-72"
          />
        </div>
        <Button
          class="self-start"
          size="sm"
          :disabled="busy || !scaleReady(scale.id)"
          @click="
            emit('saveScale', {
              scaleId: scale.id,
              name: (drafts.scaleNames[scale.id] ?? '').trim(),
              points: (drafts.scalePoints[scale.id] ?? []).map((point) => ({
                value: point.value,
                label: point.label.trim(),
              })),
            })
          "
        >
          {{ t('authoring.translation.saveScale') }}
        </Button>
      </fieldset>
    </section>

    <section aria-labelledby="translation-dimensions-heading" class="flex flex-col gap-2">
      <h3 id="translation-dimensions-heading" class="text-sm font-medium">
        {{ t('authoring.translation.dimensionsHeading') }}
      </h3>
      <div
        v-for="dimension in dimensions"
        :key="dimension.id"
        class="flex flex-wrap items-end gap-2"
      >
        <span class="w-24 font-mono text-xs">{{ dimension.code }}</span>
        <p class="text-muted-foreground min-w-40 text-sm">{{ dimension.name }}</p>
        <Input
          v-model="drafts.dimensions[dimension.id]"
          :lang="locale"
          :aria-label="t('authoring.translation.dimensionNameFor', { code: dimension.code })"
          class="h-8 w-56"
        />
        <Button
          size="xs"
          :disabled="busy || (drafts.dimensions[dimension.id] ?? '').trim() === ''"
          @click="
            emit('saveDimension', {
              dimensionId: dimension.id,
              name: (drafts.dimensions[dimension.id] ?? '').trim(),
            })
          "
        >
          {{ t('common.save') }}
        </Button>
      </div>
    </section>
  </div>
</template>
