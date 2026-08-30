<script setup lang="ts">
/**
 * Scales and dimensions for one instrument (#50's scale editor, #54).
 *
 * Instrument-level, not version-level: the bank is never frozen (#47), so this stays editable even
 * while a `published` version is selected. That is the point of snapshot-on-publish — a published
 * version keeps its own copy, so editing the bank cannot alter what it asked.
 *
 * A scale is "a named object with its anchor points listed as content, reused across items", which
 * is the shape #50 settled on. Anchor points are edited as rows rather than free JSON, because the
 * engine holds `CHECK(json_valid(...))` and the boundary holds a `z.strictObject` per point — a
 * textarea would just move the failure later.
 *
 * Emits intent; the page owns persistence.
 */
import { computed, ref } from 'vue'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isValidCode, type Dimension, type DimensionKind } from '@/lib/assessment-authoring'

export interface Scale {
  id: string
  code: string
  name: string
  points: unknown
}

const props = defineProps<{
  scales: Scale[]
  dimensions: Dimension[]
  busy?: boolean
}>()

const emit = defineEmits<{
  createScale: [{ code: string; name: string; points: { value: number; label: string }[] }]
  createDimension: [{ code: string; name: string; kind: DimensionKind }]
}>()

const { t } = useI18n()

const KINDS: DimensionKind[] = ['domain', 'style', 'axis']

/** Rendered as text so a malformed stored value shows as itself rather than as `[object Object]`. */
function pointsSummary(points: unknown): string {
  if (!Array.isArray(points)) return '—'
  return points
    .map((p) =>
      p && typeof p === 'object' && 'value' in p && 'label' in p
        ? `${(p as { value: unknown }).value} = ${(p as { label: unknown }).label}`
        : String(p)
    )
    .join(' · ')
}

/* ---------------------------------------------------------------------------------- new scale --- */

const scaleCode = ref('')
const scaleName = ref('')
const anchors = ref<{ value: string; label: string }[]>([
  { value: '1', label: '' },
  { value: '5', label: '' },
])

const existingScaleCodes = computed(() => new Set(props.scales.map((s) => s.code)))

const scaleError = computed(() => {
  if (scaleCode.value === '' && scaleName.value === '') return ''
  if (!isValidCode(scaleCode.value)) return t('authoring.bank.error.badCode')
  if (existingScaleCodes.value.has(scaleCode.value)) return t('authoring.bank.error.duplicateScale')
  if (scaleName.value.trim() === '') return t('authoring.bank.error.scaleNameRequired')

  const filled = anchors.value.filter((a) => a.label.trim() !== '')
  if (filled.length < 2) return t('authoring.bank.error.tooFewAnchors')
  if (filled.some((a) => !Number.isFinite(Number(a.value)))) {
    return t('authoring.bank.error.anchorNotNumeric')
  }
  const values = filled.map((a) => Number(a.value))
  if (new Set(values).size !== values.length) return t('authoring.bank.error.anchorValueRepeated')
  return ''
})

const scaleReady = computed(
  () => scaleCode.value !== '' && scaleName.value.trim() !== '' && scaleError.value === ''
)

function commitScale() {
  if (!scaleReady.value) return
  emit('createScale', {
    code: scaleCode.value,
    name: scaleName.value.trim(),
    points: anchors.value
      .filter((a) => a.label.trim() !== '')
      .map((a) => ({ value: Number(a.value), label: a.label.trim() })),
  })
  scaleCode.value = ''
  scaleName.value = ''
  anchors.value = [
    { value: '1', label: '' },
    { value: '5', label: '' },
  ]
}

/* ------------------------------------------------------------------------------ new dimension --- */

const dimensionCode = ref('')
const dimensionName = ref('')
const dimensionKind = ref<DimensionKind>('style')

const existingDimensionCodes = computed(() => new Set(props.dimensions.map((d) => d.code)))

const dimensionError = computed(() => {
  if (dimensionCode.value === '' && dimensionName.value === '') return ''
  if (!isValidCode(dimensionCode.value)) return t('authoring.bank.error.badCode')
  if (existingDimensionCodes.value.has(dimensionCode.value)) {
    return t('authoring.bank.error.duplicateDimension')
  }
  if (dimensionName.value.trim() === '') return t('authoring.bank.error.dimensionNameRequired')
  return ''
})

const dimensionReady = computed(
  () =>
    dimensionCode.value !== '' && dimensionName.value.trim() !== '' && dimensionError.value === ''
)

function commitDimension() {
  if (!dimensionReady.value) return
  emit('createDimension', {
    code: dimensionCode.value,
    name: dimensionName.value.trim(),
    kind: dimensionKind.value,
  })
  dimensionCode.value = ''
  dimensionName.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-8" data-testid="bank-editor">
    <p class="text-muted-foreground text-sm">
      {{ t('authoring.bank.lead') }}
    </p>

    <section aria-labelledby="scales-heading" class="flex flex-col gap-3">
      <h2 id="scales-heading" class="text-base font-medium">{{ t('authoring.bank.scales') }}</h2>

      <table class="w-full text-sm" data-testid="scale-table">
        <caption class="text-muted-foreground pb-2 text-left text-sm">
          {{
            t('authoring.bank.scaleCaption')
          }}
        </caption>
        <thead>
          <tr class="border-border border-b text-left">
            <th scope="col" class="py-2 font-medium">{{ t('authoring.bank.code') }}</th>
            <th scope="col" class="py-2 font-medium">{{ t('authoring.bank.name') }}</th>
            <th scope="col" class="py-2 font-medium">{{ t('authoring.bank.anchorPoints') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!scales.length">
            <td colspan="3" class="text-muted-foreground py-3">
              {{ t('authoring.bank.noScales') }}
            </td>
          </tr>
          <tr v-for="scale in scales" :key="scale.id" class="border-border border-b">
            <th scope="row" class="py-2 font-mono text-xs font-normal">{{ scale.code }}</th>
            <td class="py-2">{{ scale.name }}</td>
            <td class="py-2 text-xs">{{ pointsSummary(scale.points) }}</td>
          </tr>
        </tbody>
      </table>

      <fieldset class="flex flex-col gap-2">
        <legend class="text-sm font-medium">{{ t('authoring.bank.newScale') }}</legend>
        <div class="flex flex-wrap items-start gap-2">
          <Input
            v-model="scaleCode"
            :aria-label="t('authoring.bank.scaleCode')"
            placeholder="likert5"
            class="h-9 w-40 font-mono text-xs"
          />
          <Input
            v-model="scaleName"
            :aria-label="t('authoring.bank.scaleName')"
            placeholder="Likert 5"
            class="h-9 w-56"
          />
        </div>

        <p class="text-muted-foreground text-xs">{{ t('authoring.bank.anchorPoints') }}</p>
        <div class="flex flex-col gap-1">
          <div v-for="(anchor, index) in anchors" :key="index" class="flex items-center gap-2">
            <Input
              v-model="anchor.value"
              :aria-label="t('authoring.bank.anchorValue', { number: index + 1 })"
              class="h-8 w-20 font-mono text-xs"
            />
            <Input
              v-model="anchor.label"
              :aria-label="t('authoring.bank.anchorLabel', { number: index + 1 })"
              :placeholder="t('authoring.bank.anchorLabelPlaceholder')"
              class="h-8 w-72"
            />
            <Button
              size="xs"
              variant="ghost"
              :disabled="anchors.length <= 2"
              :aria-label="t('authoring.bank.removeAnchor', { number: index + 1 })"
              @click="anchors.splice(index, 1)"
            >
              {{ t('authoring.bank.remove') }}
            </Button>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            @click="anchors.push({ value: String(anchors.length + 1), label: '' })"
          >
            {{ t('authoring.bank.addAnchor') }}
          </Button>
          <Button size="sm" :disabled="!scaleReady || busy" @click="commitScale">
            {{ t('authoring.bank.saveScale') }}
          </Button>
        </div>
        <p v-if="scaleError" class="text-destructive text-xs" role="alert">{{ scaleError }}</p>
      </fieldset>
    </section>

    <section aria-labelledby="dimensions-heading" class="flex flex-col gap-3">
      <h2 id="dimensions-heading" class="text-base font-medium">
        {{ t('authoring.bank.dimensions') }}
      </h2>

      <table class="w-full text-sm" data-testid="dimension-table">
        <caption class="text-muted-foreground pb-2 text-left text-sm">
          {{
            t('authoring.bank.dimensionCaption')
          }}
        </caption>
        <thead>
          <tr class="border-border border-b text-left">
            <th scope="col" class="py-2 font-medium">{{ t('authoring.bank.code') }}</th>
            <th scope="col" class="py-2 font-medium">{{ t('authoring.bank.name') }}</th>
            <th scope="col" class="py-2 font-medium">{{ t('authoring.bank.kind') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!dimensions.length">
            <td colspan="3" class="text-muted-foreground py-3">
              {{ t('authoring.bank.noDimensions') }}
            </td>
          </tr>
          <tr v-for="dimension in dimensions" :key="dimension.id" class="border-border border-b">
            <th scope="row" class="py-2 font-mono text-xs font-normal">{{ dimension.code }}</th>
            <td class="py-2">{{ dimension.name }}</td>
            <!-- The kind is a word, not a colour. -->
            <td class="py-2 text-xs">{{ dimension.kind }}</td>
          </tr>
        </tbody>
      </table>

      <fieldset class="flex flex-col gap-2">
        <legend class="text-sm font-medium">{{ t('authoring.bank.newDimension') }}</legend>
        <div class="flex flex-wrap items-start gap-2">
          <Input
            v-model="dimensionCode"
            :aria-label="t('authoring.bank.dimensionCode')"
            placeholder="directive"
            class="h-9 w-40 font-mono text-xs"
          />
          <Input
            v-model="dimensionName"
            :aria-label="t('authoring.bank.dimensionName')"
            placeholder="Directive"
            class="h-9 w-56"
          />
          <label class="text-xs">
            <span class="sr-only">{{ t('authoring.bank.dimensionKind') }}</span>
            <select
              v-model="dimensionKind"
              class="border-border h-9 rounded-md border bg-transparent px-2 text-xs"
            >
              <option v-for="kind in KINDS" :key="kind" :value="kind">{{ kind }}</option>
            </select>
          </label>
          <Button size="sm" :disabled="!dimensionReady || busy" @click="commitDimension">
            {{ t('authoring.bank.saveDimension') }}
          </Button>
        </div>
        <p v-if="dimensionError" class="text-destructive text-xs" role="alert">
          {{ dimensionError }}
        </p>
      </fieldset>
    </section>
  </div>
</template>
