<script setup lang="ts">
/**
 * The audit log. Maps to the Audit Log row of docs/security/rbac.md.
 *
 * Append-only at the database level: a RAISE(ABORT) trigger rejects any UPDATE or DELETE
 * (issue #34). There is no edit affordance here because there is no edit path at all.
 *
 * Reading this is deliberately not itself audited (issue #20) — the consequence recorded there is
 * that the one role able to read everyone's history leaves no trace of having done so.
 *
 * The event filter closes FR-011, which asks that an admin be able to see the history of instrument
 * and scoring changes. A hundred most-recent rows across every domain is not that history; being
 * able to name one kind of event is.
 */
import { computed, ref } from 'vue'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
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

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t, te } = useI18n()

useHead(() => ({ title: t('dashboard.audit.title') }))

/**
 * `reka-ui` refuses an empty string as an item value, so "no filter" needs a name of its own rather
 * than the absence of one.
 */
const ALL = 'all'

const chosen = ref<string>(ALL)
const eventType = computed(() => (chosen.value === ALL ? undefined : chosen.value))

const { data, pending, error } = useFetch<{
  events: {
    id: string
    eventType: string
    actorUserId: string | null
    targetUserId: string | null
    detail: string | null
    createdAt: string
  }[]
  eventTypes: string[]
}>('/api/v1/audit-logs', {
  query: { limit: 100, eventType },
  key: 'audit-list',
  retry: false,
})

const events = computed(() => data.value?.events ?? [])

/**
 * The options come from the server, which derives them from the rows this reader may see. Keeping a
 * list here would be a second vocabulary that could drift from the per-domain registries, and under
 * a student's scoped decision it would also name kinds of event other people cause.
 *
 * It also means the table needs no separate "nothing matched this filter" state: the options and the
 * rows arrive in one response, so an offered value always has at least one row behind it.
 */
const eventTypes = computed(() => data.value?.eventTypes ?? [])

/**
 * Same shape as `roleLabel` on the Overview: the code is the stable identity and the sentence is
 * rendered here, per ADR-009. An unlabelled code falls back to itself, so a domain that adds an
 * audited action shows a readable value before anyone writes its two translations rather than a
 * missing-key string. `audit-event-labels.test.ts` is what stops it staying that way.
 */
function eventLabel(code: string): string {
  const key = `dashboard.audit.eventTypes.${code}`
  return te(key) ? t(key) : code
}

/**
 * Rendered into the trigger rather than left to `SelectValue` to resolve. Resolving it means
 * reading the mounted item, which server rendering has none of, so the control shipped as an empty
 * button until hydration.
 */
const chosenLabel = computed(() =>
  chosen.value === ALL ? t('dashboard.audit.filterAll') : eventLabel(chosen.value)
)

/**
 * True only until the first response. A refetch on filter change must not swap the table for
 * skeletons: that unmounts the select the reader is still holding focus in.
 */
const firstLoad = computed(() => pending.value && data.value === null)
</script>

<template>
  <Alert v-if="error" variant="destructive">
    <AlertTitle>{{ t('dashboard.audit.loadFailed') }}</AlertTitle>
  </Alert>

  <div v-else-if="firstLoad" class="flex flex-col gap-2">
    <Skeleton v-for="n in 6" :key="n" class="h-12 rounded-lg" />
  </div>

  <DataCard
    v-else
    :title="t('dashboard.audit.heading')"
    :description="t('dashboard.audit.caption')"
    flush
  >
    <div class="border-b px-4 py-3 sm:px-6">
      <Field>
        <FieldLabel id="audit-filter-label" as="span">
          {{ t('dashboard.audit.filterLabel') }}
        </FieldLabel>
        <Select :model-value="chosen" @update:model-value="chosen = String($event)">
          <SelectTrigger size="sm" aria-labelledby="audit-filter-label">
            <SelectValue>{{ chosenLabel }}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem :value="ALL">{{ t('dashboard.audit.filterAll') }}</SelectItem>
              <SelectItem v-for="code in eventTypes" :key="code" :value="code">
                {{ eventLabel(code) }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>{{ t('dashboard.audit.filterHint') }}</FieldDescription>
      </Field>

      <!-- Changing the filter replaces the table below with no visual transition to notice, so the
           new count is announced rather than only rendered. -->
      <p aria-live="polite" class="sr-only">
        {{ t('dashboard.audit.resultCount', { count: events.length }) }}
      </p>
    </div>

    <Table>
      <TableCaption class="sr-only">{{ t('dashboard.audit.tableCaption') }}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{{ t('dashboard.audit.when') }}</TableHead>
          <TableHead scope="col">{{ t('dashboard.audit.event') }}</TableHead>
          <TableHead scope="col">{{ t('dashboard.audit.actor') }}</TableHead>
          <TableHead scope="col">{{ t('dashboard.audit.target') }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty v-if="!events.length" :colspan="4">
          {{ t('dashboard.audit.empty') }}
        </TableEmpty>
        <TableRow v-for="event in events" :key="event.id">
          <TableHead scope="row" class="font-normal">
            <time :datetime="event.createdAt">
              {{ new Date(event.createdAt).toISOString().slice(0, 19).replace('T', ' ') }}
            </time>
          </TableHead>
          <TableCell>{{ eventLabel(event.eventType) }}</TableCell>
          <TableCell class="font-mono text-xs">{{ event.actorUserId || '—' }}</TableCell>
          <TableCell class="font-mono text-xs">{{ event.targetUserId || '—' }}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </DataCard>
</template>
