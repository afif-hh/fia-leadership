import { computed, reactive, ref } from 'vue'

/**
 * Client state and autosave for the answering screen (#66).
 *
 * A composable rather than a store: `@vueuse/core` is already here, nothing about this flow needs
 * state shared across pages, and adding Pinia for one screen would be weight without a reason.
 *
 * The state machine is lifted from the prototype on branch `prototype/autosave-model`, which is
 * where the retry policy was actually decided by driving it by hand. Kept free of `$fetch` so the
 * same machine can be unit-tested with fake timers; the page supplies `save` and `submit`.
 */

export type SaveState = 'idle' | 'pending' | 'saving' | 'retrying' | 'saved' | 'failed'

/** Milliseconds before an idle change is written. #60/#66 settled on roughly half a second. */
export const DEBOUNCE_MS = 500

/**
 * Three auto-retries, then stop and ask. An unbounded retry loop would leave a student watching a
 * spinner forever with no way to act; stopping surfaces the problem while keeping the answer safe
 * in memory (accessibility.md: a timeout must never lose answers).
 */
export const BACKOFF_MS = [1000, 2000, 4000] as const

export interface AssessmentItem {
  versionItemId: string
  position: number
  stem: string
  scalePoints: { value: number; label: string }[]
}

export interface UseAssessmentSessionOptions {
  items: AssessmentItem[]
  initialAnswers?: Record<string, number>
  save: (versionItemId: string, answerValue: number) => Promise<void>
  submit: () => Promise<void>
}

interface ItemState {
  state: SaveState
  attempt: number
  timer: ReturnType<typeof setTimeout> | null
}

export function useAssessmentSession(options: UseAssessmentSessionOptions) {
  const answers = reactive<Record<string, number>>({ ...(options.initialAnswers ?? {}) })

  const states = reactive<Record<string, ItemState>>({})
  for (const item of options.items) {
    states[item.versionItemId] = {
      // An answer restored from the server is already saved — not "idle", which would leave a
      // resumed session unable to submit until every item was touched again.
      state: item.versionItemId in answers ? 'saved' : 'idle',
      attempt: 0,
      timer: null,
    }
  }

  /**
   * One shared, debounced announcement rather than one per item (#63, SC 4.1.3). Answering several
   * items quickly otherwise produces a burst of overlapping announcements, which is worse than
   * silence for a screen reader user.
   */
  const statusMessage = ref('')
  let statusTimer: ReturnType<typeof setTimeout> | null = null

  const answeredCount = computed(() => Object.keys(answers).length)
  const total = computed(() => options.items.length)

  const allSaved = computed(() =>
    options.items.every((item) => states[item.versionItemId]!.state === 'saved')
  )
  const canSubmit = computed(() => answeredCount.value === total.value && allSaved.value)

  const failedItemIds = computed(() =>
    options.items
      .filter((item) => states[item.versionItemId]!.state === 'failed')
      .map((item) => item.versionItemId)
  )

  /** The first item with no answer — where a resumed session scrolls to (#60). */
  const firstUnansweredId = computed(
    () => options.items.find((item) => !(item.versionItemId in answers))?.versionItemId ?? null
  )

  function announceSaved() {
    if (statusTimer) clearTimeout(statusTimer)
    statusTimer = setTimeout(() => {
      statusMessage.value = `Tersimpan. ${answeredCount.value} dari ${total.value} pertanyaan terjawab.`
    }, DEBOUNCE_MS)
  }

  async function write(versionItemId: string) {
    const entry = states[versionItemId]!
    entry.state = 'saving'

    try {
      await options.save(versionItemId, answers[versionItemId]!)
      entry.state = 'saved'
      entry.attempt = 0
      announceSaved()
    } catch {
      if (entry.attempt < BACKOFF_MS.length) {
        const wait = BACKOFF_MS[entry.attempt]!
        entry.attempt += 1
        entry.state = 'retrying'
        entry.timer = setTimeout(() => void write(versionItemId), wait)
      } else {
        // Stop and tell them. The answer stays in `answers`, so nothing is lost and a manual
        // retry has something to send.
        entry.state = 'failed'
      }
    }
  }

  /** Called on every selection. Debounced per item, which is also the request granularity (#64). */
  function setAnswer(versionItemId: string, answerValue: number) {
    answers[versionItemId] = answerValue

    const entry = states[versionItemId]!
    if (entry.timer) clearTimeout(entry.timer)
    entry.attempt = 0
    entry.state = 'pending'
    entry.timer = setTimeout(() => void write(versionItemId), DEBOUNCE_MS)
  }

  /** After the auto-retries have run out. Resets the budget, so it can fail and be retried again. */
  function retry(versionItemId: string) {
    const entry = states[versionItemId]!
    if (entry.state !== 'failed') return
    entry.attempt = 0
    void write(versionItemId)
  }

  const submitting = ref(false)
  const submitError = ref('')

  async function submitAll() {
    if (!canSubmit.value || submitting.value) return false
    submitting.value = true
    submitError.value = ''
    try {
      await options.submit()
      return true
    } catch {
      submitError.value = 'Jawaban gagal dikirim. Periksa koneksimu, lalu coba lagi.'
      return false
    } finally {
      submitting.value = false
    }
  }

  /** Timers outlive the component otherwise, and a retry firing after unmount writes to a corpse. */
  function dispose() {
    for (const entry of Object.values(states)) {
      if (entry.timer) clearTimeout(entry.timer)
    }
    if (statusTimer) clearTimeout(statusTimer)
  }

  return {
    answers,
    states,
    statusMessage,
    answeredCount,
    total,
    canSubmit,
    allSaved,
    failedItemIds,
    firstUnansweredId,
    submitting,
    submitError,
    setAnswer,
    retry,
    submitAll,
    dispose,
  }
}
