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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import DataCard from '@/components/dashboard/DataCard.vue'
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
  <div class="flex flex-col gap-6" data-testid="bank-editor">
    <p class="text-muted-foreground text-sm">
      {{ t('authoring.bank.lead') }}
    </p>

    <DataCard
      :title="t('authoring.bank.scales')"
      :description="t('authoring.bank.scaleCaption')"
      flush
    >
      <Table data-testid="scale-table">
        <TableCaption class="sr-only">{{ t('authoring.bank.scaleTableCaption') }}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{{ t('authoring.bank.code') }}</TableHead>
            <TableHead scope="col">{{ t('authoring.bank.name') }}</TableHead>
            <TableHead scope="col">{{ t('authoring.bank.anchorPoints') }}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableEmpty v-if="!scales.length" :colspan="3">
            {{ t('authoring.bank.noScales') }}
          </TableEmpty>
          <TableRow v-for="scale in scales" :key="scale.id">
            <TableHead scope="row" class="font-mono text-xs font-normal">
              {{ scale.code }}
            </TableHead>
            <TableCell>{{ scale.name }}</TableCell>
            <TableCell class="text-xs whitespace-normal">
              {{ pointsSummary(scale.points) }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </DataCard>

    <DataCard :title="t('authoring.bank.newScale')" :level="3">
      <FieldGroup>
        <Field orientation="responsive">
          <Field>
            <FieldLabel for="scale-code">{{ t('authoring.bank.scaleCode') }}</FieldLabel>
            <Input
              id="scale-code"
              v-model="scaleCode"
              placeholder="likert5"
              class="font-mono text-xs"
            />
          </Field>
          <Field>
            <FieldLabel for="scale-name">{{ t('authoring.bank.scaleName') }}</FieldLabel>
            <Input id="scale-name" v-model="scaleName" placeholder="Likert 5" />
          </Field>
        </Field>

        <FieldSet>
          <FieldLegend variant="label">{{ t('authoring.bank.anchorPoints') }}</FieldLegend>
          <div class="flex flex-col gap-2">
            <div v-for="(anchor, index) in anchors" :key="index" class="flex items-end gap-2">
              <Input
                v-model="anchor.value"
                :aria-label="t('authoring.bank.anchorValue', { number: index + 1 })"
                class="w-20 font-mono text-xs"
              />
              <Input
                v-model="anchor.label"
                :aria-label="t('authoring.bank.anchorLabel', { number: index + 1 })"
                :placeholder="t('authoring.bank.anchorLabelPlaceholder')"
                class="w-72"
              />
              <Button
                size="sm"
                variant="ghost"
                :disabled="anchors.length <= 2"
                :aria-label="t('authoring.bank.removeAnchor', { number: index + 1 })"
                @click="anchors.splice(index, 1)"
              >
                {{ t('authoring.bank.remove') }}
              </Button>
            </div>
          </div>
          <Button
            class="w-fit"
            size="sm"
            variant="outline"
            @click="anchors.push({ value: String(anchors.length + 1), label: '' })"
          >
            {{ t('authoring.bank.addAnchor') }}
          </Button>
        </FieldSet>

        <FieldError :errors="scaleError ? [scaleError] : []" />
      </FieldGroup>

      <template #footer>
        <Button :disabled="!scaleReady || busy" @click="commitScale">
          {{ t('authoring.bank.saveScale') }}
        </Button>
      </template>
    </DataCard>

    <DataCard
      :title="t('authoring.bank.dimensions')"
      :description="t('authoring.bank.dimensionCaption')"
      flush
    >
      <Table data-testid="dimension-table">
        <TableCaption class="sr-only">
          {{ t('authoring.bank.dimensionTableCaption') }}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{{ t('authoring.bank.code') }}</TableHead>
            <TableHead scope="col">{{ t('authoring.bank.name') }}</TableHead>
            <TableHead scope="col">{{ t('authoring.bank.kind') }}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableEmpty v-if="!dimensions.length" :colspan="3">
            {{ t('authoring.bank.noDimensions') }}
          </TableEmpty>
          <TableRow v-for="dimension in dimensions" :key="dimension.id">
            <TableHead scope="row" class="font-mono text-xs font-normal">
              {{ dimension.code }}
            </TableHead>
            <TableCell>{{ dimension.name }}</TableCell>
            <!-- The kind is a word, not a colour. -->
            <TableCell class="text-xs">{{ dimension.kind }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </DataCard>

    <DataCard :title="t('authoring.bank.newDimension')" :level="3">
      <FieldGroup>
        <Field orientation="responsive">
          <Field>
            <FieldLabel for="dimension-code">{{ t('authoring.bank.dimensionCode') }}</FieldLabel>
            <Input
              id="dimension-code"
              v-model="dimensionCode"
              placeholder="directive"
              class="font-mono text-xs"
            />
          </Field>
          <Field>
            <FieldLabel for="dimension-name">{{ t('authoring.bank.dimensionName') }}</FieldLabel>
            <Input id="dimension-name" v-model="dimensionName" placeholder="Directive" />
          </Field>
          <Field>
            <!-- Three fixed options, so they are all on screen rather than behind a listbox. -->
            <FieldLabel as="span">{{ t('authoring.bank.kind') }}</FieldLabel>
            <ToggleGroup
              v-model="dimensionKind"
              type="single"
              variant="outline"
              :aria-label="t('authoring.bank.dimensionKind')"
            >
              <ToggleGroupItem v-for="kind in KINDS" :key="kind" :value="kind">
                {{ kind }}
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
        </Field>

        <FieldError :errors="dimensionError ? [dimensionError] : []" />
      </FieldGroup>

      <template #footer>
        <Button :disabled="!dimensionReady || busy" @click="commitDimension">
          {{ t('authoring.bank.saveDimension') }}
        </Button>
      </template>
    </DataCard>
  </div>
</template>
