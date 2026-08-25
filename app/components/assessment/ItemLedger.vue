<script setup lang="ts">
/**
 * The ledger — Variant A, the primary authoring screen (#50, #54).
 *
 * One dense table over the version's selection: code, stem, scale, reverse-coding, a dimension
 * count that discloses a chip picker per row, and a diff tag against the source version. This
 * variant won on the job the map's destination names: KDPGK v1's real item bank does not exist
 * anywhere yet and has to be typed in once, through this screen.
 *
 * A real `<table>` with `scope`-carrying headers rather than a grid of divs — the DoD requires it,
 * and a screen reader needs the row/column association for a cell to mean anything.
 *
 * Emits intent and never calls the API, so it stays mountable in a test without a server. The page
 * owns persistence.
 */
import { computed, ref } from 'vue'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  changeLabelFor,
  changesByItem,
  isValidCode,
  type Dimension,
  type VersionDiff,
  type VersionItem,
} from '@/lib/assessment-authoring'

const props = defineProps<{
  items: VersionItem[]
  dimensions: Dimension[]
  diff: VersionDiff | null
  /** A published or retired version renders read-only: no inputs, no trailing row. */
  frozen: boolean
  /** Scale codes offered for a new item; the first is the default. */
  scaleCodes: string[]
}>()

const emit = defineEmits<{
  appendItem: [{ code: string; stem: string; scaleCode: string }]
  removeItem: [itemId: string]
  toggleReverse: [itemId: string, reverseCoded: boolean]
  setDimensions: [itemId: string, dimensionIds: string[]]
  moveItem: [itemId: string, direction: -1 | 1]
}>()

const changes = computed(() => changesByItem(props.diff))

/** Which row has its dimension picker disclosed. One at a time: the point of the disclosure is
 * that a 20-dimension matrix never dominates the table (#50). */
const openRow = ref<string | null>(null)

function toggleRow(itemId: string) {
  openRow.value = openRow.value === itemId ? null : itemId
}

/* ----------------------------------------------------------------------------- trailing row --- */

const draftCode = ref('')
const draftStem = ref('')
const draftScale = ref('')

const draftScaleCode = computed(() => draftScale.value || props.scaleCodes[0] || '')

const existingCodes = computed(() => new Set(props.items.map((item) => item.code)))

/**
 * Why the trailing row commits on Enter rather than on every keystroke: #50 asked for a row that
 * "appends an item as soon as you type in it", meaning no separate add-a-row action — the row is
 * already there. Taken literally, per-keystroke would post an item per character. So the row is
 * always present and commits on Enter or on the Add button, which is also what makes it
 * keyboard-operable without a pointer.
 */
const draftError = computed(() => {
  if (draftCode.value === '' && draftStem.value === '') return ''
  if (!isValidCode(draftCode.value)) {
    return 'Kode hanya boleh huruf kecil, angka dan underscore.'
  }
  if (existingCodes.value.has(draftCode.value)) return 'Kode itu sudah dipakai di versi ini.'
  if (draftStem.value.trim() === '') return 'Teks item wajib diisi.'
  return ''
})

const draftReady = computed(
  () => draftCode.value !== '' && draftStem.value.trim() !== '' && draftError.value === ''
)

function commitDraft() {
  if (!draftReady.value) return
  emit('appendItem', {
    code: draftCode.value,
    stem: draftStem.value.trim(),
    scaleCode: draftScaleCode.value,
  })
  draftCode.value = ''
  draftStem.value = ''
  draftScale.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <table class="w-full text-sm" data-testid="item-ledger">
      <caption class="text-muted-foreground pb-2 text-left text-sm">
        {{
          frozen
            ? 'Snapshot versi ini — teks yang dibekukan saat publish, bukan teks bank hari ini.'
            : 'Item pada versi ini. Tab bergerak ke kanan; baris terakhir menambah item.'
        }}
      </caption>

      <thead>
        <tr class="border-border border-b text-left">
          <th scope="col" class="py-2 font-medium">Kode</th>
          <th scope="col" class="py-2 font-medium">Teks item</th>
          <th scope="col" class="py-2 font-medium">Scale</th>
          <th scope="col" class="py-2 font-medium">Reverse</th>
          <th scope="col" class="py-2 font-medium">Dimensi</th>
          <th scope="col" class="py-2 font-medium">Perubahan</th>
          <th scope="col" class="py-2 font-medium">
            <span class="sr-only">Aksi</span>
          </th>
        </tr>
      </thead>

      <tbody>
        <tr v-if="!items.length">
          <td colspan="7" class="text-muted-foreground py-3">
            Belum ada item. Tambahkan di baris terakhir, atau tempel banyak item sekaligus.
          </td>
        </tr>

        <template v-for="(item, index) in items" :key="item.versionItemId">
          <tr class="border-border border-b align-top">
            <th scope="row" class="py-2 font-mono text-xs font-normal">{{ item.code }}</th>

            <td class="py-2">{{ item.stem }}</td>
            <td class="py-2 font-mono text-xs">{{ item.scaleCode ?? '—' }}</td>

            <td class="py-2">
              <!-- A checkbox, not a colour swatch: reverse-coding inverts scoring, so it has to be
                   readable as state by assistive technology and not inferred from styling. -->
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  :checked="item.reverseCoded"
                  :disabled="frozen"
                  :aria-label="`Reverse-coding untuk ${item.code}`"
                  @change="
                    emit('toggleReverse', item.itemId, ($event.target as HTMLInputElement).checked)
                  "
                >
                <span class="text-xs">{{ item.reverseCoded ? 'Ya' : 'Tidak' }}</span>
              </label>
            </td>

            <td class="py-2">
              <button
                type="button"
                class="border-border hover:bg-muted rounded-md border px-2 py-0.5 text-xs"
                :aria-expanded="openRow === item.versionItemId"
                :aria-controls="`dimensions-${item.versionItemId}`"
                @click="toggleRow(item.versionItemId)"
              >
                {{ item.dimensions.length }} dimensi
              </button>
            </td>

            <td class="py-2 text-xs">
              <!-- Conveyed in text. A colour-only diff tag fails WCAG 2.2 AA, and this column is
                   the reason #49's in-place rewording decision is governable at all. -->
              <span v-if="changeLabelFor(changes.get(item.itemId))">
                {{ changeLabelFor(changes.get(item.itemId)) }}
              </span>
              <span v-else class="text-muted-foreground">—</span>
            </td>

            <td class="py-2 text-right">
              <div v-if="!frozen" class="flex justify-end gap-1">
                <Button
                  size="xs"
                  variant="ghost"
                  :disabled="index === 0"
                  :aria-label="`Naikkan ${item.code}`"
                  @click="emit('moveItem', item.itemId, -1)"
                >
                  ↑
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  :disabled="index === items.length - 1"
                  :aria-label="`Turunkan ${item.code}`"
                  @click="emit('moveItem', item.itemId, 1)"
                >
                  ↓
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  :aria-label="`Hapus ${item.code}`"
                  @click="emit('removeItem', item.itemId)"
                >
                  Hapus
                </Button>
              </div>
            </td>
          </tr>

          <!-- The per-row chip picker. Plain buttons carrying aria-pressed, so it is operable by
               keyboard with no key handling of our own. -->
          <tr v-if="openRow === item.versionItemId" class="border-border border-b">
            <td :id="`dimensions-${item.versionItemId}`" colspan="7" class="pb-3">
              <fieldset :disabled="frozen">
                <legend class="text-muted-foreground pb-1 text-xs">
                  Dimensi untuk {{ item.code }}
                </legend>
                <div class="flex flex-wrap gap-1">
                  <button
                    v-for="dimension in dimensions"
                    :key="dimension.id"
                    type="button"
                    class="rounded-full border px-2 py-0.5 text-xs"
                    :class="
                      item.dimensions.some((d) => d.id === dimension.id)
                        ? 'border-foreground text-foreground font-medium'
                        : 'border-border text-muted-foreground'
                    "
                    :aria-pressed="item.dimensions.some((d) => d.id === dimension.id)"
                    :disabled="frozen"
                    @click="
                      emit(
                        'setDimensions',
                        item.itemId,
                        item.dimensions.some((d) => d.id === dimension.id)
                          ? item.dimensions.filter((d) => d.id !== dimension.id).map((d) => d.id)
                          : [...item.dimensions.map((d) => d.id), dimension.id]
                      )
                    "
                  >
                    <!-- The kind is spelled out, not encoded in the chip's colour. -->
                    {{ dimension.code }} · {{ dimension.kind }}
                  </button>
                </div>
              </fieldset>
            </td>
          </tr>
        </template>

        <!-- The trailing row. Absent on a frozen version, which has nothing to append to. -->
        <tr v-if="!frozen" class="align-top" data-testid="ledger-trailing-row">
          <td class="py-2">
            <Input
              v-model="draftCode"
              aria-label="Kode item baru"
              placeholder="kd01"
              class="h-7 font-mono text-xs"
              @keydown.enter.prevent="commitDraft"
            />
          </td>
          <td class="py-2">
            <Input
              v-model="draftStem"
              aria-label="Teks item baru"
              placeholder="Tulis pernyataan item…"
              class="h-7"
              @keydown.enter.prevent="commitDraft"
            />
          </td>
          <td class="py-2">
            <select
              v-model="draftScale"
              aria-label="Scale untuk item baru"
              class="border-border h-7 rounded-md border bg-transparent px-1 text-xs"
            >
              <option v-for="code in scaleCodes" :key="code" :value="code">{{ code }}</option>
            </select>
          </td>
          <td class="py-2" />
          <td class="py-2" />
          <td class="py-2" />
          <td class="py-2 text-right">
            <Button size="xs" :disabled="!draftReady" @click="commitDraft">Tambah</Button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- role=alert so the reason is announced, not only shown next to a disabled button. -->
    <p v-if="draftError" class="text-destructive text-xs" role="alert">{{ draftError }}</p>
  </div>
</template>
