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
  <p v-if="error" class="text-destructive text-sm" role="alert">
    {{ t('dashboard.audit.loadFailed') }}
  </p>

  <div v-else-if="pending" class="flex flex-col gap-2">
    <Skeleton v-for="n in 6" :key="n" class="h-12 rounded-lg" />
  </div>

  <table v-else class="w-full text-sm">
    <caption class="text-muted-foreground pb-2 text-left text-sm">
      {{
        t('dashboard.audit.caption')
      }}
    </caption>
    <thead>
      <tr class="border-border border-b text-left">
        <th scope="col" class="py-2 font-medium">{{ t('dashboard.audit.when') }}</th>
        <th scope="col" class="py-2 font-medium">{{ t('dashboard.audit.event') }}</th>
        <th scope="col" class="py-2 font-medium">{{ t('dashboard.audit.actor') }}</th>
        <th scope="col" class="py-2 font-medium">{{ t('dashboard.audit.target') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="!events.length">
        <td colspan="4" class="text-muted-foreground py-3">
          {{ t('dashboard.audit.empty') }}
        </td>
      </tr>
      <tr v-for="event in events" :key="event.id" class="border-border border-b">
        <th scope="row" class="py-2 font-normal">
          <time :datetime="event.createdAt">
            {{ new Date(event.createdAt).toISOString().slice(0, 19).replace('T', ' ') }}
          </time>
        </th>
        <td class="py-2 font-mono">{{ event.eventType }}</td>
        <td class="py-2 font-mono text-xs">{{ event.actorUserId || '—' }}</td>
        <td class="py-2 font-mono text-xs">{{ event.targetUserId || '—' }}</td>
      </tr>
    </tbody>
  </table>
</template>
