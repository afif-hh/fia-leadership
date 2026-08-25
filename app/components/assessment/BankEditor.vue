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
  if (!isValidCode(scaleCode.value)) return 'Kode hanya boleh huruf kecil, angka dan underscore.'
  if (existingScaleCodes.value.has(scaleCode.value)) return 'Kode scale itu sudah dipakai.'
  if (scaleName.value.trim() === '') return 'Nama scale wajib diisi.'

  const filled = anchors.value.filter((a) => a.label.trim() !== '')
  if (filled.length < 2) return 'Sebuah scale butuh minimal dua anchor point berlabel.'
  if (filled.some((a) => !Number.isFinite(Number(a.value)))) {
    return 'Setiap anchor point butuh nilai berupa angka.'
  }
  const values = filled.map((a) => Number(a.value))
  if (new Set(values).size !== values.length) return 'Nilai anchor point tidak boleh berulang.'
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
  if (!isValidCode(dimensionCode.value)) {
    return 'Kode hanya boleh huruf kecil, angka dan underscore.'
  }
  if (existingDimensionCodes.value.has(dimensionCode.value)) return 'Kode dimensi itu sudah dipakai.'
  if (dimensionName.value.trim() === '') return 'Nama dimensi wajib diisi.'
  return ''
})

const dimensionReady = computed(
  () => dimensionCode.value !== '' && dimensionName.value.trim() !== '' && dimensionError.value === ''
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
      Scale dan dimensi milik instrumen, bukan versi — keduanya tetap dapat diubah walau ada versi
      yang sudah dipublikasikan, karena versi itu menyimpan snapshot-nya sendiri.
    </p>

    <section aria-labelledby="scales-heading" class="flex flex-col gap-3">
      <h2 id="scales-heading" class="text-base font-medium">Scale</h2>

      <table class="w-full text-sm" data-testid="scale-table">
        <caption class="text-muted-foreground pb-2 text-left text-sm">
          Setiap item memakai satu scale. Anchor point-nya adalah teks yang dibaca peserta.
        </caption>
        <thead>
          <tr class="border-border border-b text-left">
            <th scope="col" class="py-2 font-medium">Kode</th>
            <th scope="col" class="py-2 font-medium">Nama</th>
            <th scope="col" class="py-2 font-medium">Anchor point</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!scales.length">
            <td colspan="3" class="text-muted-foreground py-3">
              Belum ada scale. Sebuah item tidak dapat dibuat sebelum ada minimal satu scale.
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
        <legend class="text-sm font-medium">Scale baru</legend>
        <div class="flex flex-wrap items-start gap-2">
          <Input
            v-model="scaleCode"
            aria-label="Kode scale"
            placeholder="likert5"
            class="h-9 w-40 font-mono text-xs"
          />
          <Input v-model="scaleName" aria-label="Nama scale" placeholder="Likert 5" class="h-9 w-56" />
        </div>

        <p class="text-muted-foreground text-xs">Anchor point</p>
        <div class="flex flex-col gap-1">
          <div v-for="(anchor, index) in anchors" :key="index" class="flex items-center gap-2">
            <Input
              v-model="anchor.value"
              :aria-label="`Nilai anchor point ${index + 1}`"
              class="h-8 w-20 font-mono text-xs"
            />
            <Input
              v-model="anchor.label"
              :aria-label="`Label anchor point ${index + 1}`"
              placeholder="Sangat tidak sesuai"
              class="h-8 w-72"
            />
            <Button
              size="xs"
              variant="ghost"
              :disabled="anchors.length <= 2"
              :aria-label="`Hapus anchor point ${index + 1}`"
              @click="anchors.splice(index, 1)"
            >
              Hapus
            </Button>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            @click="anchors.push({ value: String(anchors.length + 1), label: '' })"
          >
            Tambah anchor point
          </Button>
          <Button size="sm" :disabled="!scaleReady || busy" @click="commitScale">
            Simpan scale
          </Button>
        </div>
        <p v-if="scaleError" class="text-destructive text-xs" role="alert">{{ scaleError }}</p>
      </fieldset>
    </section>

    <section aria-labelledby="dimensions-heading" class="flex flex-col gap-3">
      <h2 id="dimensions-heading" class="text-base font-medium">Dimensi</h2>

      <table class="w-full text-sm" data-testid="dimension-table">
        <caption class="text-muted-foreground pb-2 text-left text-sm">
          Sebuah item boleh mengukur beberapa dimensi sekaligus, termasuk dari kind yang berbeda.
        </caption>
        <thead>
          <tr class="border-border border-b text-left">
            <th scope="col" class="py-2 font-medium">Kode</th>
            <th scope="col" class="py-2 font-medium">Nama</th>
            <th scope="col" class="py-2 font-medium">Kind</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!dimensions.length">
            <td colspan="3" class="text-muted-foreground py-3">
              Belum ada dimensi. Item tanpa dimensi tidak akan menghasilkan skor, dan versi tidak
              dapat dipublikasikan.
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
        <legend class="text-sm font-medium">Dimensi baru</legend>
        <div class="flex flex-wrap items-start gap-2">
          <Input
            v-model="dimensionCode"
            aria-label="Kode dimensi"
            placeholder="directive"
            class="h-9 w-40 font-mono text-xs"
          />
          <Input
            v-model="dimensionName"
            aria-label="Nama dimensi"
            placeholder="Directive"
            class="h-9 w-56"
          />
          <label class="text-xs">
            <span class="sr-only">Kind dimensi</span>
            <select
              v-model="dimensionKind"
              class="border-border h-9 rounded-md border bg-transparent px-2 text-xs"
            >
              <option v-for="kind in KINDS" :key="kind" :value="kind">{{ kind }}</option>
            </select>
          </label>
          <Button size="sm" :disabled="!dimensionReady || busy" @click="commitDimension">
            Simpan dimensi
          </Button>
        </div>
        <p v-if="dimensionError" class="text-destructive text-xs" role="alert">
          {{ dimensionError }}
        </p>
      </fieldset>
    </section>
  </div>
</template>
