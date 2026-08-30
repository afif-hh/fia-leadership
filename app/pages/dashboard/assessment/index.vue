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
    <p v-if="error" class="text-destructive text-sm" role="alert">
      {{ t('authoring.instruments.loadFailed') }}
    </p>

    <div v-else-if="pending" class="flex flex-col gap-2">
      <Skeleton v-for="n in 3" :key="n" class="h-12 rounded-lg" />
    </div>

    <template v-else>
      <table class="w-full text-sm">
        <caption class="text-muted-foreground pb-2 text-left text-sm">
          {{
            t('authoring.instruments.caption')
          }}
        </caption>
        <thead>
          <tr class="border-border border-b text-left">
            <th scope="col" class="py-2 font-medium">{{ t('authoring.bank.code') }}</th>
            <th scope="col" class="py-2 font-medium">{{ t('authoring.bank.name') }}</th>
            <th scope="col" class="py-2 font-medium">
              <span class="sr-only">{{ t('authoring.ledger.actions') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!instruments.length">
            <td colspan="3" class="text-muted-foreground py-3">
              {{ t('authoring.instruments.empty') }}
            </td>
          </tr>
          <tr v-for="instrument in instruments" :key="instrument.id" class="border-border border-b">
            <th scope="row" class="py-2 font-mono text-xs font-normal">{{ instrument.code }}</th>
            <td class="py-2">{{ instrument.name }}</td>
            <td class="py-2 text-right">
              <NuxtLink
                :to="localePath(`/dashboard/assessment/${instrument.id}`)"
                class="text-primary text-sm underline-offset-4 hover:underline"
              >
                {{ t('authoring.instruments.open') }}
              </NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>

      <section aria-labelledby="new-instrument-heading" class="flex flex-col gap-2">
        <h2 id="new-instrument-heading" class="text-base font-medium">
          {{ t('authoring.instruments.newHeading') }}
        </h2>
        <div class="flex flex-wrap items-start gap-2">
          <Input
            v-model="newCode"
            :aria-label="t('authoring.instruments.code')"
            placeholder="kdpgk"
            class="h-9 w-40 font-mono text-xs"
          />
          <Input
            v-model="newName"
            :aria-label="t('authoring.instruments.name')"
            placeholder="KDPGK"
            class="h-9 w-64"
          />
          <Button :disabled="!canCreate || creating" @click="createInstrument">
            {{ creating ? t('common.saving') : t('authoring.instruments.create') }}
          </Button>
        </div>
        <p v-if="codeError" class="text-destructive text-xs" role="alert">{{ codeError }}</p>
        <p v-if="createError" class="text-destructive text-xs" role="alert">{{ createError }}</p>
      </section>
    </template>
  </div>
</template>
