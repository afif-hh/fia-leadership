import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  BACKOFF_MS,
  DEBOUNCE_MS,
  useAssessmentSession,
  type AssessmentItem,
} from '../../composables/useAssessmentSession'

/**
 * The autosave state machine (#66), whose policy was decided by driving the prototype on branch
 * `prototype/autosave-model` by hand.
 *
 * Fake timers throughout: the debounce and the backoff are the behaviour under test, and waiting
 * for them in real time would make this suite seconds long and flaky at the boundaries.
 */

const items: AssessmentItem[] = [0, 1].map((position) => ({
  versionItemId: `item-${position}`,
  position,
  stem: `Pernyataan ${position}.`,
  scalePoints: [
    { value: 1, label: 'Tidak' },
    { value: 5, label: 'Ya' },
  ],
}))

/** Advances timers and lets the promise chain each one starts settle. */
async function tick(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('useAssessmentSession', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const build = (
    save: UseSave = () => Promise.resolve(),
    initialAnswers?: Record<string, number>
  ) => useAssessmentSession({ items, initialAnswers, save, submit: () => Promise.resolve() })

  type UseSave = (versionItemId: string, answerValue: number) => Promise<void>

  describe('saving', () => {
    it('does not write until the debounce elapses', async () => {
      const save = vi.fn<UseSave>(() => Promise.resolve())
      const s = build(save)

      s.setAnswer('item-0', 5)
      expect(s.states['item-0']!.state).toBe('pending')
      expect(save).not.toHaveBeenCalled()

      await tick(DEBOUNCE_MS)
      expect(save).toHaveBeenCalledWith('item-0', 5)
      expect(s.states['item-0']!.state).toBe('saved')
    })

    it('collapses rapid changes to one request carrying the last value', async () => {
      // A student changing their mind three times is one answer, not three — this is what keeps
      // the request volume far under the 60/min limit devsecops.md sets.
      const save = vi.fn<UseSave>(() => Promise.resolve())
      const s = build(save)

      s.setAnswer('item-0', 1)
      await tick(DEBOUNCE_MS / 2)
      s.setAnswer('item-0', 5)
      await tick(DEBOUNCE_MS)

      expect(save).toHaveBeenCalledTimes(1)
      expect(save).toHaveBeenCalledWith('item-0', 5)
    })

    it('debounces each item separately', async () => {
      const save = vi.fn<UseSave>(() => Promise.resolve())
      const s = build(save)

      s.setAnswer('item-0', 1)
      s.setAnswer('item-1', 5)
      await tick(DEBOUNCE_MS)

      expect(save).toHaveBeenCalledTimes(2)
    })

    it('treats an answer restored from the server as already saved', async () => {
      // Otherwise a resumed session could not submit until every item was touched again — the
      // exact frustration #60's resume behaviour exists to avoid.
      const s = build(undefined, { 'item-0': 5 })
      expect(s.states['item-0']!.state).toBe('saved')
      expect(s.states['item-1']!.state).toBe('idle')
    })
  })

  describe('failure and retry', () => {
    it('retries on the documented backoff, then gives up and asks', async () => {
      const save = vi.fn<UseSave>(() => Promise.reject(new Error('offline')))
      const s = build(save)

      s.setAnswer('item-0', 5)
      await tick(DEBOUNCE_MS)
      expect(save).toHaveBeenCalledTimes(1)
      expect(s.states['item-0']!.state).toBe('retrying')

      for (const [index, wait] of BACKOFF_MS.entries()) {
        await tick(wait)
        expect(save).toHaveBeenCalledTimes(index + 2)
      }

      // Budget spent: stop rather than spin forever with no way for the student to act.
      expect(s.states['item-0']!.state).toBe('failed')
      expect(s.failedItemIds.value).toEqual(['item-0'])
    })

    it('never loses the answer when saving fails', async () => {
      // accessibility.md is explicit: a timeout must not make answers disappear.
      const s = build(() => Promise.reject(new Error('offline')))

      s.setAnswer('item-0', 5)
      await tick(DEBOUNCE_MS + BACKOFF_MS.reduce((a, b) => a + b, 0))

      expect(s.states['item-0']!.state).toBe('failed')
      expect(s.answers['item-0']).toBe(5)
    })

    it('recovers on a manual retry once the network is back', async () => {
      let failing = true
      const s = build(() => (failing ? Promise.reject(new Error('offline')) : Promise.resolve()))

      s.setAnswer('item-0', 5)
      await tick(DEBOUNCE_MS + BACKOFF_MS.reduce((a, b) => a + b, 0))
      expect(s.states['item-0']!.state).toBe('failed')

      failing = false
      s.retry('item-0')
      await tick(0)
      expect(s.states['item-0']!.state).toBe('saved')
    })

    it('ignores a retry for an item that is not failed', async () => {
      const save = vi.fn<UseSave>(() => Promise.resolve())
      const s = build(save)
      s.retry('item-0')
      await tick(0)
      expect(save).not.toHaveBeenCalled()
    })

    it('restarts the retry budget on a fresh change', async () => {
      // A student who edits after a failure should get the full backoff again, not the remains of
      // the previous attempt's budget.
      let failing = true
      const save = vi.fn<UseSave>(() =>
        failing ? Promise.reject(new Error('offline')) : Promise.resolve()
      )
      const s = build(save)

      s.setAnswer('item-0', 5)
      await tick(DEBOUNCE_MS + BACKOFF_MS.reduce((a, b) => a + b, 0))
      expect(s.states['item-0']!.state).toBe('failed')

      failing = false
      s.setAnswer('item-0', 1)
      await tick(DEBOUNCE_MS)
      expect(s.states['item-0']!.state).toBe('saved')
    })
  })

  describe('the submit gate', () => {
    it('stays closed until every item is answered and saved', async () => {
      const s = build()
      expect(s.canSubmit.value).toBe(false)

      s.setAnswer('item-0', 5)
      await tick(DEBOUNCE_MS)
      expect(s.canSubmit.value).toBe(false)

      s.setAnswer('item-1', 1)
      // Answered but not yet written — submitting here would race the last save.
      expect(s.canSubmit.value).toBe(false)

      await tick(DEBOUNCE_MS)
      expect(s.canSubmit.value).toBe(true)
    })

    it('stays closed while any item is failed', async () => {
      let failing = false
      const s = build(() => (failing ? Promise.reject(new Error('offline')) : Promise.resolve()))

      s.setAnswer('item-0', 5)
      await tick(DEBOUNCE_MS)

      failing = true
      s.setAnswer('item-1', 1)
      await tick(DEBOUNCE_MS + BACKOFF_MS.reduce((a, b) => a + b, 0))

      expect(s.states['item-1']!.state).toBe('failed')
      expect(s.canSubmit.value).toBe(false)
    })

    it('lets other items be answered while one is failed', async () => {
      // A failed save blocks submit, never further answering — otherwise one flaky request
      // strands the student on a half-finished questionnaire.
      const s = useAssessmentSession({
        items,
        save: (id) => (id === 'item-0' ? Promise.reject(new Error('offline')) : Promise.resolve()),
        submit: () => Promise.resolve(),
      })

      s.setAnswer('item-0', 5)
      await tick(DEBOUNCE_MS + BACKOFF_MS.reduce((a, b) => a + b, 0))
      s.setAnswer('item-1', 1)
      await tick(DEBOUNCE_MS)

      expect(s.states['item-0']!.state).toBe('failed')
      expect(s.states['item-1']!.state).toBe('saved')
    })

    it('refuses to submit while the gate is closed', async () => {
      const submit = vi.fn(() => Promise.resolve())
      const s = useAssessmentSession({ items, save: () => Promise.resolve(), submit })

      await expect(s.submitAll()).resolves.toBe(false)
      expect(submit).not.toHaveBeenCalled()
    })

    it('reports a failed submit without claiming success', async () => {
      const s = useAssessmentSession({
        items,
        save: () => Promise.resolve(),
        submit: () => Promise.reject(new Error('boom')),
      })

      s.setAnswer('item-0', 5)
      s.setAnswer('item-1', 1)
      await tick(DEBOUNCE_MS)

      await expect(s.submitAll()).resolves.toBe(false)
      expect(s.submitFailed.value).toBe(true)
      expect(s.submitting.value).toBe(false)
    })
  })

  describe('the announcement', () => {
    it('is debounced and shared, not one per item', async () => {
      // SC 4.1.3: answering several items quickly must not produce a burst of overlapping
      // announcements. One region, one message, describing overall progress.
      const s = build()

      s.setAnswer('item-0', 5)
      s.setAnswer('item-1', 1)
      await tick(DEBOUNCE_MS)
      expect(s.savedAnnouncement.value).toBeNull()

      await tick(DEBOUNCE_MS)
      expect(s.savedAnnouncement.value).toEqual({ answered: 2, total: 2 })
    })
  })

  describe('resume', () => {
    it('points at the first unanswered item', async () => {
      const s = build(undefined, { 'item-0': 5 })
      expect(s.firstUnansweredId.value).toBe('item-1')
    })

    it('points nowhere once everything is answered', async () => {
      const s = build(undefined, { 'item-0': 5, 'item-1': 1 })
      expect(s.firstUnansweredId.value).toBeNull()
    })
  })

  it('cancels pending timers on dispose, so a retry cannot outlive the page', async () => {
    const save = vi.fn<UseSave>(() => Promise.resolve())
    const s = build(save)

    s.setAnswer('item-0', 5)
    s.dispose()
    await tick(DEBOUNCE_MS * 4)

    expect(save).not.toHaveBeenCalled()
  })
})
