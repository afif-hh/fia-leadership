<script setup lang="ts">
/**
 * The Users list. Maps to the User Administration row added in issue #22.
 *
 * Read-only in this foundation. The write path — granting roles, disabling an account — is
 * audit-classified, so it needs `audit: true` on its endpoint (forcing a fresh session) and a
 * role-change audit row. That is deliberately not built here: the shell proves the gate works,
 * and mutation belongs with its own review.
 */
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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

useHead(() => ({ title: t('dashboard.users.title') }))

const { data, pending, error } = useFetch<{
  users: { id: string; email: string; name: string | null; status: string; roles: string | null }[]
}>('/api/v1/users', { key: 'users-list', retry: false })

const users = computed(() => data.value?.users ?? [])

/** `active` and `disabled` are schema values, not prose. An unrecognised one renders as itself. */
function statusLabel(status: string): string {
  return te(`dashboard.users.status.${status}`) ? t(`dashboard.users.status.${status}`) : status
}
</script>

<template>
  <Alert v-if="error" variant="destructive">
    <AlertTitle>{{ t('dashboard.users.loadFailed') }}</AlertTitle>
  </Alert>

  <div v-else-if="pending" class="flex flex-col gap-2">
    <Skeleton v-for="n in 5" :key="n" class="h-12 rounded-lg" />
  </div>

  <DataCard
    v-else
    :title="t('dashboard.users.heading')"
    :description="t('dashboard.users.caption')"
    flush
  >
    <Table>
      <TableCaption class="sr-only">{{ t('dashboard.users.tableCaption') }}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{{ t('dashboard.users.email') }}</TableHead>
          <TableHead scope="col">{{ t('dashboard.users.name') }}</TableHead>
          <TableHead scope="col">{{ t('dashboard.users.roles') }}</TableHead>
          <TableHead scope="col">{{ t('dashboard.users.statusColumn') }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty v-if="!users.length" :colspan="4">
          {{ t('dashboard.users.empty') }}
        </TableEmpty>
        <TableRow v-for="user in users" :key="user.id">
          <TableHead scope="row" class="font-normal">{{ user.email }}</TableHead>
          <TableCell>{{ user.name || '—' }}</TableCell>
          <TableCell>{{ user.roles || '—' }}</TableCell>
          <TableCell>
            <!-- Status is carried by the badge's text, not its colour: colour alone fails WCAG 2.2 AA. -->
            <Badge :variant="user.status === 'active' ? 'outline' : 'destructive'">
              {{ statusLabel(user.status) }}
            </Badge>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </DataCard>
</template>
