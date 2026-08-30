<script setup lang="ts">
/**
 * The audit log. Maps to the Audit Log row of docs/security/rbac.md.
 *
 * Append-only at the database level: a RAISE(ABORT) trigger rejects any UPDATE or DELETE
 * (issue #34). There is no edit affordance here because there is no edit path at all.
 *
 * Reading this is deliberately not itself audited (issue #20) — the consequence recorded there is
 * that the one role able to read everyone's history leaves no trace of having done so.
 */
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertTitle } from '@/components/ui/alert'
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

const { t } = useI18n()

useHead(() => ({ title: t('dashboard.audit.title') }))

const { data, pending, error } = useFetch<{
  events: {
    id: string
    eventType: string
    actorUserId: string | null
    targetUserId: string | null
    detail: string | null
    createdAt: string
  }[]
}>('/api/v1/audit-logs', { query: { limit: 100 }, key: 'audit-list', retry: false })

const events = computed(() => data.value?.events ?? [])
</script>

<template>
  <Alert v-if="error" variant="destructive">
    <AlertTitle>{{ t('dashboard.audit.loadFailed') }}</AlertTitle>
  </Alert>

  <div v-else-if="pending" class="flex flex-col gap-2">
    <Skeleton v-for="n in 6" :key="n" class="h-12 rounded-lg" />
  </div>

  <DataCard
    v-else
    :title="t('dashboard.audit.heading')"
    :description="t('dashboard.audit.caption')"
    flush
  >
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
          <TableCell class="font-mono">{{ event.eventType }}</TableCell>
          <TableCell class="font-mono text-xs">{{ event.actorUserId || '—' }}</TableCell>
          <TableCell class="font-mono text-xs">{{ event.targetUserId || '—' }}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </DataCard>
</template>
