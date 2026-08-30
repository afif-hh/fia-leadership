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
 * and a screen reader needs the row/column association for a cell to mean anything. shadcn's Table
 * components are that markup with the border and padding rules applied once instead of per cell.
 *
 * Emits intent and never calls the API, so it stays mountable in a test without a server. The page
 * owns persistence.
 */
import { computed, ref } from 'vue'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { FieldError, FieldLegend, FieldSet } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
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

const { t } = useI18n()

const changes = computed(() => changesByItem(props.diff))

/** The ledger's diff cell for one row. Empty means unchanged. */
function changeLabel(itemId: string): string {
  const applied = changes.value.get(itemId)
  if (!applied || applied.length === 0) return ''
  return applied.map((change) => t(`authoring.change.${change}`)).join(', ')
}

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
  // Stated before anything is typed, because it is a precondition rather than a typo: an item
  // must reference a scale, and a freshly created instrument has none. Without this the Add button
  // sat enabled and the failure came back blaming the item code.
  if (props.scaleCodes.length === 0) return t('authoring.ledger.error.noScale')
  if (draftCode.value === '' && draftStem.value === '') return ''
  if (!isValidCode(draftCode.value)) return t('authoring.ledger.error.badCode')
  if (existingCodes.value.has(draftCode.value)) return t('authoring.ledger.error.duplicateCode')
  if (draftStem.value.trim() === '') return t('authoring.ledger.error.emptyStem')
  return ''
})

const draftReady = computed(
  () =>
    props.scaleCodes.length > 0 &&
    draftCode.value !== '' &&
    draftStem.value.trim() !== '' &&
    draftError.value === ''
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
  <DataCard
    :title="t('authoring.ledger.heading')"
    :description="t(frozen ? 'authoring.ledger.captionFrozen' : 'authoring.ledger.caption')"
    flush
  >
    <Table data-testid="item-ledger">
      <TableCaption class="sr-only">{{ t('authoring.ledger.tableCaption') }}</TableCaption>

      <TableHeader>
        <TableRow>
          <TableHead scope="col">{{ t('authoring.ledger.code') }}</TableHead>
          <TableHead scope="col">{{ t('authoring.ledger.stem') }}</TableHead>
          <TableHead scope="col">{{ t('authoring.ledger.scale') }}</TableHead>
          <TableHead scope="col">{{ t('authoring.ledger.reverse') }}</TableHead>
          <TableHead scope="col">{{ t('authoring.ledger.dimensions') }}</TableHead>
          <TableHead scope="col">{{ t('authoring.ledger.changes') }}</TableHead>
          <TableHead scope="col">
            <span class="sr-only">{{ t('authoring.ledger.actions') }}</span>
          </TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        <TableEmpty v-if="!items.length" :colspan="7">
          {{ t('authoring.ledger.empty') }}
        </TableEmpty>

        <template v-for="(item, index) in items" :key="item.versionItemId">
          <TableRow class="align-top">
            <TableHead scope="row" class="font-mono text-xs font-normal">{{ item.code }}</TableHead>

            <TableCell class="whitespace-normal">{{ item.stem }}</TableCell>
            <TableCell class="font-mono text-xs">{{ item.scaleCode ?? '—' }}</TableCell>

            <TableCell>
              <!-- A checkbox, not a colour swatch: reverse-coding inverts scoring, so it has to be
                   readable as state by assistive technology and not inferred from styling. The
                   word next to it says the same thing without relying on the tick being seen. -->
              <Label class="flex items-center gap-2">
                <Checkbox
                  :model-value="item.reverseCoded"
                  :disabled="frozen"
                  :aria-label="t('authoring.ledger.reverseFor', { code: item.code })"
                  @update:model-value="emit('toggleReverse', item.itemId, $event === true)"
                />
                <span class="text-xs">{{ t(item.reverseCoded ? 'common.yes' : 'common.no') }}</span>
              </Label>
            </TableCell>

            <TableCell>
              <!-- `Button size="xs"` rather than a styled `button`: `h-6` is the 24px floor
                   accessibility.md sets, and the component is where that floor is enforced now
                   that the global `button` reset no longer carries one (#55). A raw `py-0.5
                   text-xs` button measures 22px. -->
              <Button
                type="button"
                variant="outline"
                size="xs"
                :aria-expanded="openRow === item.versionItemId"
                :aria-controls="`dimensions-${item.versionItemId}`"
                @click="toggleRow(item.versionItemId)"
              >
                {{ t('authoring.ledger.dimensionCount', item.dimensions.length) }}
              </Button>
            </TableCell>

            <TableCell class="text-xs">
              <!-- Conveyed in text. A colour-only diff tag fails WCAG 2.2 AA, and this column is
                   the reason #49's in-place rewording decision is governable at all. -->
              <span v-if="changeLabel(item.itemId)">
                {{ changeLabel(item.itemId) }}
              </span>
              <span v-else class="text-muted-foreground">—</span>
            </TableCell>

            <TableCell class="text-right">
              <div v-if="!frozen" class="flex justify-end gap-1">
                <Button
                  size="xs"
                  variant="ghost"
                  :disabled="index === 0"
                  :aria-label="t('authoring.ledger.moveUp', { code: item.code })"
                  @click="emit('moveItem', item.itemId, -1)"
                >
                  ↑
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  :disabled="index === items.length - 1"
                  :aria-label="t('authoring.ledger.moveDown', { code: item.code })"
                  @click="emit('moveItem', item.itemId, 1)"
                >
                  ↓
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  :aria-label="t('authoring.ledger.remove', { code: item.code })"
                  @click="emit('removeItem', item.itemId)"
                >
                  {{ t('authoring.ledger.removeShort') }}
                </Button>
              </div>
            </TableCell>
          </TableRow>

          <!-- The per-row chip picker. A multiple-selection ToggleGroup, which is what this is:
               reka gives each chip `aria-pressed` and the roving focus, and the whole selection
               arrives as one array — so the emit says what the row now measures rather than
               reconstructing it from the clicked chip. -->
          <TableRow v-if="openRow === item.versionItemId">
            <TableCell :id="`dimensions-${item.versionItemId}`" colspan="7" class="pb-3">
              <FieldSet :disabled="frozen">
                <FieldLegend variant="label">
                  {{ t('authoring.ledger.dimensionsFor', { code: item.code }) }}
                </FieldLegend>
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  size="sm"
                  class="flex-wrap"
                  :model-value="item.dimensions.map((d) => d.id)"
                  :disabled="frozen"
                  @update:model-value="
                    emit('setDimensions', item.itemId, ($event ?? []) as string[])
                  "
                >
                  <!-- The kind is spelled out, not encoded in the chip's colour. -->
                  <ToggleGroupItem
                    v-for="dimension in dimensions"
                    :key="dimension.id"
                    :value="dimension.id"
                  >
                    {{ dimension.code }} · {{ dimension.kind }}
                  </ToggleGroupItem>
                </ToggleGroup>
              </FieldSet>
            </TableCell>
          </TableRow>
        </template>

        <!-- The trailing row. Absent on a frozen version, which has nothing to append to. -->
        <TableRow v-if="!frozen" class="align-top" data-testid="ledger-trailing-row">
          <TableCell>
            <Input
              v-model="draftCode"
              :aria-label="t('authoring.ledger.newCode')"
              placeholder="kd01"
              class="font-mono text-xs"
              @keydown.enter.prevent="commitDraft"
            />
          </TableCell>
          <TableCell>
            <Input
              v-model="draftStem"
              :aria-label="t('authoring.ledger.newStem')"
              :placeholder="t('authoring.ledger.newStemPlaceholder')"
              @keydown.enter.prevent="commitDraft"
            />
          </TableCell>
          <TableCell>
            <Select v-model="draftScale">
              <SelectTrigger size="sm" :aria-label="t('authoring.ledger.newScale')">
                <SelectValue :placeholder="draftScaleCode || t('authoring.ledger.scale')" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="code in scaleCodes" :key="code" :value="code">
                    {{ code }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </TableCell>
          <TableCell />
          <TableCell />
          <TableCell />
          <TableCell class="text-right">
            <Button
              size="xs"
              data-testid="ledger-append"
              :disabled="!draftReady"
              @click="commitDraft"
            >
              {{ t('authoring.ledger.add') }}
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <!-- FieldError carries role=alert, so the reason is announced rather than only shown next to
         a disabled button. -->
    <template v-if="draftError" #footer>
      <FieldError :errors="[draftError]" class="text-xs" />
    </template>
  </DataCard>
</template>
