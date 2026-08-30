<script setup lang="ts">
/**
 * The dimension matrix — Variant B's one contribution, kept as a second, audit-oriented view
 * (#50, #54).
 *
 * The ledger's per-row chips remain the editing path. This view answers the question a row cannot:
 * a row says "what does this item measure", the matrix says "does *any* item measure this style".
 * A dimension with zero items produces no score at all, and catching that while authoring rather
 * than in a report is the entire reason this exists as its own view.
 *
 * Items × dimensions as a real table with both row and column headers, per the DoD. The count row
 * carries the finding in text — `0 item` and the word "belum dipetakan" — so it is never conveyed
 * by colour alone.
 */
import { computed } from 'vue'

import {
  dimensionCoverage,
  itemMeasures,
  type Dimension,
  type VersionItem,
} from '@/lib/assessment-authoring'

const props = defineProps<{
  items: VersionItem[]
  dimensions: Dimension[]
}>()

const { t } = useI18n()

const coverage = computed(() => dimensionCoverage(props.dimensions, props.items))
const unmapped = computed(() => coverage.value.filter((entry) => entry.unmapped))
</script>

<template>
  <div class="flex flex-col gap-3">
    <!--
      Stated before the table, not only inside it. The finding this view exists for should not
      require reading a 20-column header row to notice, and role=status announces it.
    -->
    <p
      v-if="unmapped.length"
      class="border-destructive text-destructive rounded-md border p-2 text-sm"
      role="status"
    >
      {{ t('authoring.matrix.unmapped', unmapped.length) }}
      <span class="font-medium">{{ unmapped.map((e) => e.dimension.code).join(', ') }}</span
      >.
    </p>
    <p v-else-if="dimensions.length" class="text-muted-foreground text-sm" role="status">
      {{ t('authoring.matrix.allMapped') }}
    </p>

    <div class="overflow-x-auto">
      <table class="w-full text-sm" data-testid="dimension-matrix">
        <caption class="text-muted-foreground pb-2 text-left text-sm">
          {{
            t('authoring.matrix.caption')
          }}
        </caption>

        <thead>
          <tr class="border-border border-b text-left">
            <th scope="col" class="py-2 pr-3 font-medium">{{ t('authoring.matrix.item') }}</th>
            <th
              v-for="entry in coverage"
              :key="entry.dimension.id"
              scope="col"
              class="px-2 py-2 text-left align-bottom font-medium"
            >
              <span class="font-mono text-xs">{{ entry.dimension.code }}</span>
              <span class="text-muted-foreground block text-xs font-normal">
                {{ entry.dimension.kind }}
              </span>
            </th>
          </tr>
        </thead>

        <tbody>
          <tr v-if="!items.length">
            <td :colspan="coverage.length + 1" class="text-muted-foreground py-3">
              {{ t('authoring.matrix.noItems') }}
            </td>
          </tr>

          <tr v-for="item in items" :key="item.versionItemId" class="border-border border-b">
            <th scope="row" class="py-2 pr-3 font-mono text-xs font-normal">{{ item.code }}</th>
            <td v-for="entry in coverage" :key="entry.dimension.id" class="px-2 py-2">
              <!--
                The glyph is decoration; the sentence is what is read. A bare check mark would
                leave a screen-reader user counting unlabelled cells.

                Real text in an `sr-only` span, not `aria-label` on the wrapper: `aria-label` is
                ignored on a generic element with no role, so it named nothing and the cell was
                announced as empty — the opposite of what this comment used to claim.
              -->
              <span class="sr-only">
                {{
                  t(
                    itemMeasures(item, entry.dimension.id)
                      ? 'authoring.matrix.measures'
                      : 'authoring.matrix.doesNotMeasure',
                    { item: item.code, dimension: entry.dimension.code }
                  )
                }}
              </span>
              <span aria-hidden="true">{{
                itemMeasures(item, entry.dimension.id) ? '✓' : '·'
              }}</span>
            </td>
          </tr>
        </tbody>

        <tfoot>
          <tr>
            <th scope="row" class="py-2 pr-3 text-left font-medium">
              {{ t('authoring.matrix.itemCount') }}
            </th>
            <td
              v-for="entry in coverage"
              :key="entry.dimension.id"
              class="px-2 py-2 text-xs"
              :class="entry.unmapped ? 'text-destructive font-medium' : ''"
            >
              <!-- Text, not colour: "0 belum dipetakan" says it outright. -->
              {{ entry.itemCount }}
              <span v-if="entry.unmapped" class="block">{{ t('authoring.matrix.notMapped') }}</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>
