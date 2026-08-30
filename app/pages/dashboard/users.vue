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
  <p v-if="error" class="text-destructive text-sm" role="alert">
    {{ t('dashboard.users.loadFailed') }}
  </p>

  <div v-else-if="pending" class="flex flex-col gap-2">
    <Skeleton v-for="n in 5" :key="n" class="h-12 rounded-lg" />
  </div>

  <table v-else class="w-full text-sm">
    <caption class="text-muted-foreground pb-2 text-left text-sm">
      {{
        t('dashboard.users.caption')
      }}
    </caption>
    <thead>
      <tr class="border-border border-b text-left">
        <th scope="col" class="py-2 font-medium">{{ t('dashboard.users.email') }}</th>
        <th scope="col" class="py-2 font-medium">{{ t('dashboard.users.name') }}</th>
        <th scope="col" class="py-2 font-medium">{{ t('dashboard.users.roles') }}</th>
        <th scope="col" class="py-2 font-medium">{{ t('dashboard.users.statusColumn') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="!users.length">
        <td colspan="4" class="text-muted-foreground py-3">{{ t('dashboard.users.empty') }}</td>
      </tr>
      <tr v-for="user in users" :key="user.id" class="border-border border-b">
        <th scope="row" class="py-2 font-normal">{{ user.email }}</th>
        <td class="py-2">{{ user.name || '—' }}</td>
        <td class="py-2">{{ user.roles || '—' }}</td>
        <td class="py-2">
          <!-- Status is carried by text, not colour: colour alone fails WCAG 2.2 AA. -->
          <span
            class="rounded-full border px-2 py-0.5 text-xs"
            :class="
              user.status === 'active'
                ? 'border-border text-foreground'
                : 'border-destructive text-destructive'
            "
          >
            {{ statusLabel(user.status) }}
          </span>
        </td>
      </tr>
    </tbody>
  </table>
</template>
