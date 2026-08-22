import { describe, expect, it } from 'vitest'

import { createConcurrencyGate } from '../../utils/hash-gate.ts'

const deferred = <T>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('the password-hashing concurrency gate', () => {
  it('runs tasks up to the limit immediately', async () => {
    const gate = createConcurrencyGate<number>(2)
    const a = deferred<number>()
    const b = deferred<number>()

    const ra = gate.run(() => a.promise)
    const rb = gate.run(() => b.promise)

    expect(gate.stats.inFlight).toBe(2)
    a.resolve(1)
    b.resolve(2)
    expect(await Promise.all([ra, rb])).toEqual([1, 2])
  })

  /** The whole point: memory is bounded by construction, not by hoping. */
  it('never exceeds the limit, however many are queued', async () => {
    const gate = createConcurrencyGate<number>(3)
    const pending = Array.from({ length: 20 }, () => deferred<number>())

    const results = pending.map((d, i) => gate.run(() => d.promise.then(() => i)))
    expect(gate.stats.inFlight).toBe(3)

    for (const d of pending) d.resolve(0)
    await Promise.all(results)

    expect(gate.stats.peakInFlight).toBe(3)
    expect(gate.stats.peakQueued).toBe(17)
  })

  it('queues rather than rejecting when saturated', async () => {
    const gate = createConcurrencyGate<string>(1)
    const first = deferred<string>()
    const order: string[] = []

    const p1 = gate.run(() => first.promise.then((v) => (order.push(v), v)))
    const p2 = gate.run(async () => (order.push('second'), 'second'))

    expect(order).toEqual([])
    first.resolve('first')
    await Promise.all([p1, p2])
    expect(order).toEqual(['first', 'second'])
  })

  /**
   * A leaked slot would present as "sign-in hangs forever", which is why this is asserted
   * explicitly rather than assumed from reading the `finally`.
   */
  it('releases its slot when a task throws', async () => {
    const gate = createConcurrencyGate<string>(1)

    await expect(gate.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(gate.stats.inFlight).toBe(0)

    await expect(gate.run(async () => 'still works')).resolves.toBe('still works')
  })

  it('rejects a nonsensical limit rather than silently serialising', () => {
    expect(() => createConcurrencyGate(0)).toThrow(/at least 1/)
  })
})
