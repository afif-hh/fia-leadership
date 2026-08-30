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
import { Button } from '@/components/ui/button'
import { Item, ItemContent, ItemTitle } from '@/components/ui/item'
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
import StatCard from '@/components/dashboard/StatCard.vue'

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

/** Literal keys, so `translations.test.ts` can see them; `t` is reactive, so this follows a
 * locale switch. */
const stats = computed(() => [
  { key: 'total', label: t('dashboard.overview.totalAccounts'), value: summary.value?.total ?? 0 },
  { key: 'active', label: t('dashboard.overview.active'), value: summary.value?.active ?? 0 },
  {
    key: 'rolesInUse',
    label: t('dashboard.overview.rolesInUse'),
    value: summary.value?.rolesInUse ?? 0,
  },
])
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
      <div v-else class="grid gap-4 sm:grid-cols-3">
        <StatCard v-for="stat in stats" :key="stat.key" :label="stat.label" :value="stat.value" />
      </div>
    </section>

    <!--
      A table, not a chart. dashboard.md requires every chart to have a text equivalent
      (docs/security/accessibility.md); a table IS the text equivalent, so this needs no second
      representation and no colour to carry meaning. The bar is decorative and aria-hidden.

      Small-group suppression does not apply: it governs student statistics, not counts of
      administrative accounts (issue #22).
    -->
    <DataCard
      :title="t('dashboard.overview.roleDistribution')"
      :description="t('dashboard.overview.roleTableCaption')"
      flush
    >
      <Table>
        <TableCaption class="sr-only">
          {{ t('dashboard.overview.roleTableSrCaption') }}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{{ t('dashboard.overview.role') }}</TableHead>
            <TableHead scope="col" class="text-right">
              {{ t('dashboard.overview.accountsColumn') }}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableEmpty v-if="!summary?.distribution?.length" :colspan="2">
            {{ t('dashboard.overview.noRolesGranted') }}
          </TableEmpty>
          <TableRow v-for="row in summary?.distribution ?? []" :key="row.role">
            <TableHead scope="row" class="font-normal">{{ roleLabel(row.role) }}</TableHead>
            <TableCell class="text-right">
              <span class="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  class="bg-primary inline-block h-2 rounded-full"
                  :style="{ width: `${(row.total / maxRoleTotal) * 64}px` }"
                />
                {{ row.total }}
              </span>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <template #footer>
        <Button as-child variant="link" size="sm" class="px-0">
          <NuxtLink :to="localePath('/dashboard/users')">
            {{ t('dashboard.overview.viewAllUsers') }}
          </NuxtLink>
        </Button>
      </template>
    </DataCard>

    <DataCard
      :title="t('dashboard.overview.recentAudit')"
      :description="t('dashboard.overview.recentAuditCaption')"
    >
      <div v-if="auditPending" class="flex flex-col gap-2">
        <Skeleton v-for="n in 3" :key="n" class="h-10 rounded-lg" />
      </div>
      <p v-else-if="!events.length" class="text-muted-foreground text-sm">
        {{ t('dashboard.overview.noAuditYet') }}
      </p>
      <ul v-else class="flex flex-col gap-2">
        <li v-for="event in events" :key="event.id">
          <Item variant="outline" size="sm">
            <ItemContent>
              <ItemTitle class="font-mono">{{ event.eventType }}</ItemTitle>
            </ItemContent>
            <time :datetime="event.createdAt" class="text-muted-foreground shrink-0 text-sm">
              {{ new Date(event.createdAt).toISOString().slice(0, 16).replace('T', ' ') }}
            </time>
          </Item>
        </li>
      </ul>

      <template #footer>
        <Button as-child variant="link" size="sm" class="px-0">
          <NuxtLink :to="localePath('/dashboard/audit')">
            {{ t('dashboard.overview.viewAuditLog') }}
          </NuxtLink>
        </Button>
      </template>
    </DataCard>
  </div>
</template>
