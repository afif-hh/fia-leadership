#!/usr/bin/env node
/**
 * PROTOTYPE — throwaway TUI for issue #66 (Client state and autosave behaviour), child of the
 * student-facing assessment taking flow map (#57). Not production code.
 *
 * Question: what's the client-side save state machine for one Likert item, and what does it
 * feel like under a flaky network, a failed save, and a second browser tab writing to the same
 * session? Time is turn-based (press `t` to advance one tick) rather than real timers, so every
 * transition can be watched and paused on.
 *
 * Run: node scripts/prototype-autosave-model.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * Pure model — no I/O, no console, portable. This is the part worth lifting into the real
 * client if the shape survives review.
 * ---------------------------------------------------------------------------------------------
 */

const DEBOUNCE_TICKS = 2 // matches #60/#64's "debounced ~500ms after a change"
const LATENCY_TICKS = 2 // simulated request round-trip
const BACKOFF_SCHEDULE = [1, 2, 4] // ticks to wait before each auto-retry
const MAX_AUTO_RETRIES = BACKOFF_SCHEDULE.length

const ITEM_IDS = ['item-1', 'item-2']

export function createModel() {
  const items = {}
  for (const id of ITEM_IDS) {
    items[id] = {
      value: null, // what the student last picked, this tab's view
      status: 'idle', // idle | debouncing | saving | saved | failed
      debounceRemaining: 0,
      latencyRemaining: 0,
      retryCount: 0,
      backoffRemaining: 0,
      lastError: null,
    }
  }
  return {
    items,
    network: 'up', // up | down
    serverTruth: Object.fromEntries(ITEM_IDS.map((id) => [id, null])), // omniscient — no real client sees this
    tick: 0,
    submitAttempted: false,
    submitResult: null, // null | 'ok' | { blocked: [itemId...] }
    log: [],
  }
}

function pushLog(model, message) {
  model.log.unshift(`[t${model.tick}] ${message}`)
  model.log = model.log.slice(0, 6)
}

/** (state, action) => state. Mutates and returns the same object — throwaway, not a purity contest. */
export function dispatch(model, action) {
  switch (action.type) {
    case 'SELECT': {
      const item = model.items[action.itemId]
      item.value = action.value
      item.status = 'debouncing'
      item.debounceRemaining = DEBOUNCE_TICKS
      item.retryCount = 0
      item.lastError = null
      pushLog(model, `${action.itemId}: selected ${action.value}, debounce started`)
      return model
    }

    case 'NETWORK_TOGGLE': {
      model.network = model.network === 'up' ? 'down' : 'up'
      pushLog(model, `network now ${model.network}`)
      return model
    }

    case 'EXTERNAL_WRITE': {
      // Another tab/device saves a different value for the same item, via its own (unseen)
      // request. Nothing here notifies this tab — per #64, the client never polls or subscribes.
      const item = model.items[action.itemId]
      const newValue = ((model.serverTruth[action.itemId] ?? 0) % 5) + 1
      model.serverTruth[action.itemId] = newValue
      pushLog(model, `${action.itemId}: EXTERNAL write landed server-side -> ${newValue} (this tab unaware)`)
      void item
      return model
    }

    case 'MANUAL_RETRY': {
      const item = model.items[action.itemId]
      if (item.status !== 'failed') return model
      item.status = 'saving'
      item.latencyRemaining = LATENCY_TICKS
      pushLog(model, `${action.itemId}: manual retry`)
      return model
    }

    case 'SUBMIT': {
      model.submitAttempted = true
      const blocked = ITEM_IDS.filter((id) => model.items[id].status !== 'saved')
      model.submitResult = blocked.length === 0 ? 'ok' : { blocked }
      pushLog(model, blocked.length === 0 ? 'SUBMIT accepted' : `SUBMIT blocked: ${blocked.join(', ')}`)
      return model
    }

    case 'TICK': {
      model.tick += 1
      for (const id of ITEM_IDS) {
        const item = model.items[id]

        if (item.status === 'debouncing') {
          item.debounceRemaining -= 1
          if (item.debounceRemaining <= 0) {
            item.status = 'saving'
            item.latencyRemaining = LATENCY_TICKS
            pushLog(model, `${id}: debounce elapsed, save request sent`)
          }
          continue
        }

        if (item.status === 'saving') {
          item.latencyRemaining -= 1
          if (item.latencyRemaining <= 0) {
            if (model.network === 'up') {
              item.status = 'saved'
              item.retryCount = 0
              item.lastError = null
              model.serverTruth[id] = item.value
              pushLog(model, `${id}: save succeeded`)
            } else {
              item.lastError = 'timeout'
              if (item.retryCount < MAX_AUTO_RETRIES) {
                item.status = 'debouncing' // reuse the counter as a generic "waiting" state
                item.backoffRemaining = BACKOFF_SCHEDULE[item.retryCount]
                item.debounceRemaining = item.backoffRemaining
                item.retryCount += 1
                item.status = 'backoff'
                pushLog(model, `${id}: save failed (timeout), auto-retry ${item.retryCount}/${MAX_AUTO_RETRIES} in ${item.backoffRemaining}t`)
              } else {
                item.status = 'failed'
                pushLog(model, `${id}: save failed after ${MAX_AUTO_RETRIES} auto-retries, giving up — manual retry required`)
              }
            }
          }
          continue
        }

        if (item.status === 'backoff') {
          item.backoffRemaining -= 1
          if (item.backoffRemaining <= 0) {
            item.status = 'saving'
            item.latencyRemaining = LATENCY_TICKS
            pushLog(model, `${id}: retrying now`)
          }
        }
      }
      return model
    }

    default:
      return model
  }
}

/* -------------------------------------------------------------------------------------------
 * TUI shell — impure, throwaway. Imports the model above; nothing flows the other direction.
 * ---------------------------------------------------------------------------------------------
 */

if (import.meta.url === `file://${process.argv[1]}`) {
  const readline = await import('node:readline')

  let model = createModel()

  const STATUS_LABEL = {
    idle: 'Belum dijawab',
    debouncing: 'Menunggu (debounce)...',
    backoff: 'Gagal, menunggu retry otomatis...',
    saving: 'Menyimpan...',
    saved: 'Tersimpan',
    failed: 'GAGAL — perlu retry manual',
  }

  function render() {
    console.clear()
    console.log('\x1b[1mPrototype — autosave state machine (issue #66)\x1b[0m')
    console.log(`tick=${model.tick}  network=\x1b[1m${model.network}\x1b[0m\n`)

    for (const id of ITEM_IDS) {
      const item = model.items[id]
      const serverVal = model.serverTruth[id]
      const drift = item.status === 'saved' && serverVal !== item.value ? '  \x1b[1m<-- DRIFT (overwritten by another tab)\x1b[0m' : ''
      console.log(`\x1b[1m${id}\x1b[0m  value=${item.value ?? '·'}  status=${STATUS_LABEL[item.status]}`)
      console.log(`\x1b[2m  (omniscient debug) server truth=${serverVal ?? '·'}${drift}\x1b[0m`)
    }

    console.log()
    const allSaved = ITEM_IDS.every((id) => model.items[id].status === 'saved')
    console.log(`Submit button: \x1b[1m${allSaved ? 'ENABLED' : 'disabled'}\x1b[0m`)
    if (model.submitResult) {
      console.log(model.submitResult === 'ok' ? '  -> last submit: accepted' : `  -> last submit: blocked on ${model.submitResult.blocked.join(', ')}`)
    }

    console.log('\n\x1b[2mRecent events:\x1b[0m')
    for (const line of model.log) console.log(`  \x1b[2m${line}\x1b[0m`)

    console.log('\n\x1b[1m[1-5]\x1b[0m set item-1  \x1b[1m[q,w,e,r,t via shift? no]\x1b[0m')
    console.log('\x1b[1m[shift+1-5]\x1b[0m set item-2   \x1b[1m[space]\x1b[0m tick   \x1b[1m[n]\x1b[0m toggle network')
    console.log('\x1b[1m[x]\x1b[0m external write on item-1   \x1b[1m[X]\x1b[0m external write on item-2')
    console.log('\x1b[1m[m]\x1b[0m manual retry item-1   \x1b[1m[M]\x1b[0m manual retry item-2   \x1b[1m[s]\x1b[0m submit   \x1b[1m[c]\x1b[0m quit')
  }

  readline.emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY) process.stdin.setRawMode(true)

  render()

  process.stdin.on('keypress', (str, key) => {
    if (key?.ctrl && key.name === 'c') process.exit(0)

    switch (str) {
      case '1': case '2': case '3': case '4': case '5':
        model = dispatch(model, { type: 'SELECT', itemId: 'item-1', value: Number(str) })
        break
      case '!': model = dispatch(model, { type: 'SELECT', itemId: 'item-2', value: 1 }); break
      case '@': model = dispatch(model, { type: 'SELECT', itemId: 'item-2', value: 2 }); break
      case '#': model = dispatch(model, { type: 'SELECT', itemId: 'item-2', value: 3 }); break
      case '$': model = dispatch(model, { type: 'SELECT', itemId: 'item-2', value: 4 }); break
      case '%': model = dispatch(model, { type: 'SELECT', itemId: 'item-2', value: 5 }); break
      case ' ': model = dispatch(model, { type: 'TICK' }); break
      case 'n': model = dispatch(model, { type: 'NETWORK_TOGGLE' }); break
      case 'x': model = dispatch(model, { type: 'EXTERNAL_WRITE', itemId: 'item-1' }); break
      case 'X': model = dispatch(model, { type: 'EXTERNAL_WRITE', itemId: 'item-2' }); break
      case 'm': model = dispatch(model, { type: 'MANUAL_RETRY', itemId: 'item-1' }); break
      case 'M': model = dispatch(model, { type: 'MANUAL_RETRY', itemId: 'item-2' }); break
      case 's': model = dispatch(model, { type: 'SUBMIT' }); break
      case 'c': process.exit(0); break
      default: break
    }
    render()
  })
}
