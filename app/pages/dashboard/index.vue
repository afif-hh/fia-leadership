<script setup lang="ts">
/**
 * The Overview. A real summary, not a placeholder (issue #22).
 *
 * `docs/features/dashboard.md` mandates progressive disclosure — summary first, detail behind
 * explicit drill-down — and there is genuinely something to summarise: user counts, role
 * distribution, and recent audit events all come from tables this foundation builds. It is also
 * the only surface that exercises `definePolicyHandler` end to end against real data.
 */
import { computed } from 'vue'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t, te } = useI18n()
const localePath = useLocalePath()

useHead(() => ({ title: t('dashboard.overview.title') }))

const { data: users, pending: usersPending } = useFetch<{
  summary: {
    total: number
    active: number
    rolesInUse: number
    distribution: { role: string; total: number }[]
  }
}>('/api/v1/users', { query: { summary: '1' }, key: 'overview-users', retry: false })

const { data: audit, pending: auditPending } = useFetch<{
  events: { id: string; eventType: string; actorUserId: string | null; createdAt: string }[]
}>('/api/v1/audit-logs', { query: { limit: 5 }, key: 'overview-audit', retry: false })

const summary = computed(() => users.value?.summary)
const events = computed(() => audit.value?.events ?? [])

/**
 * Role codes come from rbac.md via the schema and never change; only their rendering does, so the
 * names live in the message files under `roles.*`. An unknown code falls back to itself rather
 * than to a missing-key string, which is what a newly added role should look like before it is
 * translated.
 */
function roleLabel(code: string): string {
  return te(`roles.${code}`) ? t(`roles.${code}`) : code
}

const maxRoleTotal = computed(() =>
  Math.max(1, ...(summary.value?.distribution ?? []).map((d) => d.total))
)
</script>

<template>
  <div class="flex flex-col gap-6">
    <section aria-labelledby="accounts-heading" class="flex flex-col gap-4">
      <h2 id="accounts-heading" class="text-base font-medium">
        {{ t('dashboard.overview.accounts') }}
      </h2>

      <div v-if="usersPending" class="grid gap-4 sm:grid-cols-3">
        <Skeleton v-for="n in 3" :key="n" class="h-24 rounded-xl" />
      </div>
      <dl v-else class="grid gap-4 sm:grid-cols-3">
        <div class="bg-card border-border rounded-xl border p-4">
          <dt class="text-muted-foreground text-sm">{{ t('dashboard.overview.totalAccounts') }}</dt>
          <dd class="mt-1 text-2xl font-semibold">{{ summary?.total ?? 0 }}</dd>
        </div>
        <div class="bg-card border-border rounded-xl border p-4">
          <dt class="text-muted-foreground text-sm">{{ t('dashboard.overview.active') }}</dt>
          <dd class="mt-1 text-2xl font-semibold">{{ summary?.active ?? 0 }}</dd>
        </div>
        <div class="bg-card border-border rounded-xl border p-4">
          <dt class="text-muted-foreground text-sm">{{ t('dashboard.overview.rolesInUse') }}</dt>
          <dd class="mt-1 text-2xl font-semibold">{{ summary?.rolesInUse ?? 0 }}</dd>
        </div>
      </dl>
    </section>

    <Separator />

    <section aria-labelledby="distribution-heading" class="flex flex-col gap-4">
      <h2 id="distribution-heading" class="text-base font-medium">
        {{ t('dashboard.overview.roleDistribution') }}
      </h2>

      <!--
      A table, not a chart. dashboard.md requires every chart to have a text equivalent
      (docs/security/accessibility.md); a table IS the text equivalent, so this needs no second
      representation and no colour to carry meaning. The bar is decorative and aria-hidden.

      Small-group suppression does not apply: it governs student statistics, not counts of
      administrative accounts (issue #22).
    -->
      <table class="w-full text-sm">
        <caption class="text-muted-foreground pb-2 text-left text-sm">
          {{
            t('dashboard.overview.roleTableCaption')
          }}
        </caption>
        <thead>
          <tr class="border-border border-b text-left">
            <th scope="col" class="py-2 font-medium">{{ t('dashboard.overview.role') }}</th>
            <th scope="col" class="py-2 text-right font-medium">
              {{ t('dashboard.overview.accountsColumn') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!summary?.distribution?.length">
            <td colspan="2" class="text-muted-foreground py-3">
              {{ t('dashboard.overview.noRolesGranted') }}
            </td>
          </tr>
          <tr
            v-for="row in summary?.distribution ?? []"
            :key="row.role"
            class="border-border border-b"
          >
            <th scope="row" class="py-2 font-normal">{{ roleLabel(row.role) }}</th>
            <td class="py-2 text-right">
              <span class="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  class="bg-primary inline-block h-2 rounded-full"
                  :style="{ width: `${(row.total / maxRoleTotal) * 64}px` }"
                />
                {{ row.total }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <NuxtLink :to="localePath('/dashboard/users')" class="text-primary w-fit text-sm underline">
        {{ t('dashboard.overview.viewAllUsers') }}
      </NuxtLink>
    </section>

    <Separator />

    <section aria-labelledby="recent-heading" class="flex flex-col gap-4">
      <h2 id="recent-heading" class="text-base font-medium">
        {{ t('dashboard.overview.recentAudit') }}
      </h2>

      <div v-if="auditPending" class="flex flex-col gap-2">
        <Skeleton v-for="n in 3" :key="n" class="h-10 rounded-lg" />
      </div>
      <p v-else-if="!events.length" class="text-muted-foreground text-sm">
        {{ t('dashboard.overview.noAuditYet') }}
      </p>
      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="event in events"
          :key="event.id"
          class="bg-card border-border flex items-baseline justify-between gap-4 rounded-lg border p-3 text-sm"
        >
          <span class="font-mono">{{ event.eventType }}</span>
          <time :datetime="event.createdAt" class="text-muted-foreground shrink-0">
            {{ new Date(event.createdAt).toISOString().slice(0, 16).replace('T', ' ') }}
          </time>
        </li>
      </ul>

      <NuxtLink :to="localePath('/dashboard/audit')" class="text-primary w-fit text-sm underline">
        {{ t('dashboard.overview.viewAuditLog') }}
      </NuxtLink>
    </section>
  </div>
</template>
