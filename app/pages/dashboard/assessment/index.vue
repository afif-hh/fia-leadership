<script setup lang="ts">
/**
 * Assessment configuration — the instrument index (#54).
 *
 * Maps to the **Assessment Configuration** row of rbac.md, whose Lab Admin and Academic Lead cells
 * are both `CRUD` (#45). Everything here is read plus instrument/version creation; the authoring
 * itself lives one level down, on the version screen.
 */
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
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
import { isValidCode } from '@/lib/assessment-authoring'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { t, locale } = useI18n()
const localePath = useLocalePath()

useHead(() => ({ title: t('authoring.instruments.title') }))

interface Instrument {
  id: string
  code: string
  name: string
  description: string | null
}

const { data, pending, error, refresh } = useFetch<{ instruments: Instrument[] }>(
  '/api/v1/assessment/instruments',
  { key: 'assessment-instruments', retry: false, query: { locale } }
)

const instruments = computed(() => data.value?.instruments ?? [])

const newCode = ref('')
const newName = ref('')
const creating = ref(false)
const createError = ref('')

const codeError = computed(() =>
  newCode.value !== '' && !isValidCode(newCode.value) ? t('authoring.bank.error.badCode') : ''
)
const canCreate = computed(
  () => newCode.value !== '' && newName.value.trim() !== '' && codeError.value === ''
)

async function createInstrument() {
  if (!canCreate.value) return
  creating.value = true
  createError.value = ''
  try {
    await $fetch('/api/v1/assessment/instruments', {
      method: 'POST',
      body: { code: newCode.value, name: newName.value.trim() },
    })
    newCode.value = ''
    newName.value = ''
    await refresh()
  } catch {
    // The envelope's message is not surfaced verbatim: it is written for a developer, and a 422
    // reflects request shape. The author gets a sentence they can act on instead.
    createError.value = t('authoring.instruments.createFailed')
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <Alert v-if="error" variant="destructive">
      <AlertTitle>{{ t('authoring.instruments.loadFailed') }}</AlertTitle>
    </Alert>

    <div v-else-if="pending" class="flex flex-col gap-2">
      <Skeleton v-for="n in 3" :key="n" class="h-12 rounded-lg" />
    </div>

    <template v-else>
      <DataCard
        :title="t('authoring.instruments.heading')"
        :description="t('authoring.instruments.caption')"
        flush
      >
        <Table>
          <TableCaption class="sr-only">
            {{ t('authoring.instruments.tableCaption') }}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{{ t('authoring.bank.code') }}</TableHead>
              <TableHead scope="col">{{ t('authoring.bank.name') }}</TableHead>
              <TableHead scope="col">
                <span class="sr-only">{{ t('authoring.ledger.actions') }}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableEmpty v-if="!instruments.length" :colspan="3">
              {{ t('authoring.instruments.empty') }}
            </TableEmpty>
            <TableRow v-for="instrument in instruments" :key="instrument.id">
              <TableHead scope="row" class="font-mono text-xs font-normal">
                {{ instrument.code }}
              </TableHead>
              <TableCell>{{ instrument.name }}</TableCell>
              <TableCell class="text-right">
                <Button as-child variant="link" size="sm">
                  <NuxtLink :to="localePath(`/dashboard/assessment/${instrument.id}`)">
                    {{ t('authoring.instruments.open') }}
                  </NuxtLink>
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </DataCard>

      <DataCard
        :title="t('authoring.instruments.newHeading')"
        :description="t('authoring.instruments.newCaption')"
      >
        <FieldGroup>
          <Field orientation="responsive">
            <Field :data-invalid="codeError !== '' || undefined">
              <FieldLabel for="new-instrument-code">
                {{ t('authoring.instruments.code') }}
              </FieldLabel>
              <Input
                id="new-instrument-code"
                v-model="newCode"
                placeholder="kdpgk"
                class="font-mono text-xs"
                :aria-invalid="codeError !== '' || undefined"
              />
              <FieldError :errors="codeError ? [codeError] : []" />
            </Field>
            <Field>
              <FieldLabel for="new-instrument-name">
                {{ t('authoring.instruments.name') }}
              </FieldLabel>
              <Input id="new-instrument-name" v-model="newName" placeholder="KDPGK" />
            </Field>
          </Field>

          <FieldError :errors="createError ? [createError] : []" />
        </FieldGroup>

        <template #footer>
          <Button :disabled="!canCreate || creating" @click="createInstrument">
            {{ creating ? t('common.saving') : t('authoring.instruments.create') }}
          </Button>
        </template>
      </DataCard>
    </template>
  </div>
</template>
