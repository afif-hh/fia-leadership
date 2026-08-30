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

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableEmpty,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import DataCard from '@/components/dashboard/DataCard.vue'
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
    <Alert v-if="unmapped.length" variant="destructive" role="status">
      <AlertTitle>{{ t('authoring.matrix.unmapped', unmapped.length) }}</AlertTitle>
      <AlertDescription>
        <span class="font-medium">{{ unmapped.map((e) => e.dimension.code).join(', ') }}</span
        >.
      </AlertDescription>
    </Alert>
    <Alert v-else-if="dimensions.length" role="status">
      <AlertTitle>{{ t('authoring.matrix.allMapped') }}</AlertTitle>
    </Alert>

    <DataCard
      :title="t('authoring.matrix.heading')"
      :description="t('authoring.matrix.caption')"
      flush
    >
      <Table data-testid="dimension-matrix">
        <TableCaption class="sr-only">{{ t('authoring.matrix.tableCaption') }}</TableCaption>

        <TableHeader>
          <TableRow>
            <TableHead scope="col">{{ t('authoring.matrix.item') }}</TableHead>
            <TableHead
              v-for="entry in coverage"
              :key="entry.dimension.id"
              scope="col"
              class="align-bottom"
            >
              <span class="font-mono text-xs">{{ entry.dimension.code }}</span>
              <span class="text-muted-foreground block text-xs font-normal">
                {{ entry.dimension.kind }}
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <TableEmpty v-if="!items.length" :colspan="coverage.length + 1">
            {{ t('authoring.matrix.noItems') }}
          </TableEmpty>

          <TableRow v-for="item in items" :key="item.versionItemId">
            <TableHead scope="row" class="font-mono text-xs font-normal">{{ item.code }}</TableHead>
            <TableCell v-for="entry in coverage" :key="entry.dimension.id">
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
            </TableCell>
          </TableRow>
        </TableBody>

        <TableFooter>
          <TableRow>
            <TableHead scope="row">{{ t('authoring.matrix.itemCount') }}</TableHead>
            <TableCell
              v-for="entry in coverage"
              :key="entry.dimension.id"
              class="text-xs"
              :class="entry.unmapped ? 'text-destructive font-medium' : ''"
            >
              <!-- Text, not colour: "0 belum dipetakan" says it outright. -->
              {{ entry.itemCount }}
              <span v-if="entry.unmapped" class="block">
                {{ t('authoring.matrix.notMapped') }}
              </span>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </DataCard>
  </div>
</template>
