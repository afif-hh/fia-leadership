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
useHead({ title: 'Users · Lab Admin' })

const { data, pending, error } = useFetch<{
  users: { id: string; email: string; name: string | null; status: string; roles: string | null }[]
}>('/api/v1/users', { key: 'users-list', retry: false })

const users = computed(() => data.value?.users ?? [])
</script>

<template>
  <p v-if="error" class="text-destructive text-sm" role="alert">
    Could not load users. The server refused the request.
  </p>

  <div v-else-if="pending" class="flex flex-col gap-2">
    <Skeleton v-for="n in 5" :key="n" class="h-12 rounded-lg" />
  </div>

  <table v-else class="w-full text-sm">
    <caption class="text-muted-foreground pb-2 text-left text-sm">
      Accounts on this platform. Roles are granted, never self-selected.
    </caption>
    <thead>
      <tr class="border-border border-b text-left">
        <th scope="col" class="py-2 font-medium">Email</th>
        <th scope="col" class="py-2 font-medium">Name</th>
        <th scope="col" class="py-2 font-medium">Roles</th>
        <th scope="col" class="py-2 font-medium">Status</th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="!users.length">
        <td colspan="4" class="text-muted-foreground py-3">No accounts yet.</td>
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
            {{ user.status }}
          </span>
        </td>
      </tr>
    </tbody>
  </table>
</template>
