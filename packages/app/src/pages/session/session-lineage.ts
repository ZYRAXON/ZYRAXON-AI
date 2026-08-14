import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js"
import { sessionNotFoundError } from "@/utils/server-errors"

type LineageStore<T> = { peek: (id: string) => T | undefined; resolve: (id: string) => Promise<unknown> }

type Resolution<T> = { id: string; store: LineageStore<T> } & (
  | { state: "pending" }
  | { state: "settled" }
  | { state: "refetching" }
  | { state: "failed"; failure: unknown }
)

export function createSessionLineage<T>(sessionID: () => string, lineage: () => LineageStore<T>) {
  const cached = createMemo(() => lineage().peek(sessionID()))
  const [status, setStatus] = createSignal<Resolution<T>>()
  const [retryCount, setRetryCount] = createSignal(0)

  createEffect(
    on([sessionID, lineage] as const, ([id, store]) => {
      let stale = false
      onCleanup(() => {
        stale = true
      })
      if (cached()) {
        setStatus({ id, store, state: "settled" })
        return
      }
      setStatus({ id, store, state: "pending" })
      store
        .resolve(id)
        .then(() => {
          if (!stale) setStatus({ id, store, state: "settled" })
        })
        .catch((failure) => {
          if (!stale) {
            if (retryCount() < 2) {
              setRetryCount((c) => c + 1)
              setTimeout(() => {
                if (!stale) {
                  setStatus({ id, store, state: "pending" })
                  store.resolve(id).then(() => {
                    if (!stale) setStatus({ id, store, state: "settled" })
                  }).catch((f) => {
                    if (!stale) setStatus({ id, store, state: "failed", failure: f })
                  })
                }
              }, 1000)
            } else {
              setStatus({ id, store, state: "failed", failure })
            }
          }
        })
    }),
  )

  return createMemo(() => {
    const id = sessionID()
    const value = cached()
    if (value) return value
    const state = status()
    if (state?.id !== id || state.store !== lineage()) return undefined
    if (state.state === "failed") {
      setRetryCount(0)
      throw state.failure
    }
    if (state.state === "settled") {
      setStatus({ id, store: state.store, state: "refetching" })
      state.store.resolve(id).catch(() => {})
      return undefined
    }
    if (state.state === "refetching") {
      return undefined
    }
    return undefined
  })
}
