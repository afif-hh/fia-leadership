/**
 * A concurrency gate around password hashing.
 *
 * scrypt as better-auth configures it on Workers (N=16384, r=16) needs roughly **32 MiB of
 * working memory per hash**, against a 128 MB isolate limit — about four concurrent hashes before
 * the isolate is in trouble. This platform has a shape that produces exactly that: a cohort told
 * to sign in at the start of a session.
 *
 * The Workers Paid plan lifts the CPU ceiling to 30s; it does not lift the memory one. So the gate
 * is what keeps isolate memory bounded *by construction* rather than by measurement — the design
 * is safe before any number is known. See issue #36.
 *
 * In-isolate is the correct scope precisely because the limit is per-isolate. A global or
 * KV-backed limiter would be the wrong tool for a memory bound; it remains the right tool for the
 * abuse question, which belongs to the rate-limiting ticket (#39) and is a different control.
 *
 * Queues rather than rejects: under a login spike, sign-in gets slower instead of the isolate
 * failing. That is the better failure mode, and it is the one that was chosen deliberately.
 */

/** Four fits 128 MB at 32 MiB each with room for everything else the isolate is doing. */
export const DEFAULT_MAX_CONCURRENT_HASHES = 3

export interface Gate<T> {
  run: (task: () => Promise<T>) => Promise<T>
  /** Observability for the measurement this design still owes: peak queue depth seen. */
  readonly stats: { inFlight: number; peakInFlight: number; peakQueued: number }
}

export function createConcurrencyGate<T>(
  maxConcurrent: number = DEFAULT_MAX_CONCURRENT_HASHES
): Gate<T> {
  if (maxConcurrent < 1) throw new Error('maxConcurrent must be at least 1')

  let inFlight = 0
  const queue: Array<() => void> = []
  const stats = { inFlight: 0, peakInFlight: 0, peakQueued: 0 }

  const release = () => {
    inFlight--
    stats.inFlight = inFlight
    const next = queue.shift()
    if (next) next()
  }

  return {
    stats,
    run(task) {
      return new Promise<T>((resolve, reject) => {
        const start = () => {
          inFlight++
          stats.inFlight = inFlight
          stats.peakInFlight = Math.max(stats.peakInFlight, inFlight)
          // `release` must run whether the task resolves or throws, or the gate leaks a slot and
          // eventually deadlocks — the failure mode would be "sign-in hangs forever", which is
          // worth being explicit about.
          task().then(resolve, reject).finally(release)
        }

        if (inFlight < maxConcurrent) {
          start()
        } else {
          queue.push(start)
          stats.peakQueued = Math.max(stats.peakQueued, queue.length)
        }
      })
    },
  }
}
