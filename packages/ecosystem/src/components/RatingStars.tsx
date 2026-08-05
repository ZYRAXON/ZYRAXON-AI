import { type Component, createSignal, createEffect, onCleanup } from "solid-js"
import { getAuthState } from "../services/auth"
import { getRating, setRating } from "../services/shared-data"

interface RatingStarsProps {
  itemId: string
  initialAverage?: number
  onRated?: (average: number, count: number) => void
}

const Star: Component<{ filled: boolean; size?: number }> = (props) => (
  <svg width={props.size ?? 20} height={props.size ?? 20} viewBox="0 0 24 24"
    fill={props.filled ? "#e3b341" : "none"}
    stroke={props.filled ? "#e3b341" : "#484f58"} stroke-width="1.6" stroke-linejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
)

export const RatingStars: Component<RatingStarsProps> = (props) => {
  const [average, setAverage] = createSignal(props.initialAverage ?? 0)
  const [count, setCount] = createSignal(0)
  const [mine, setMine] = createSignal(0)
  const [hover, setHover] = createSignal(0)
  const [saving, setSaving] = createSignal(false)
  const [status, setStatus] = createSignal<string | null>(null)

  const auth = getAuthState()
  const userId = auth.isAuthenticated && auth.user ? auth.user.id : null

  createEffect(() => {
    const itemId = props.itemId
    let alive = true
    ;(async () => {
      try {
        const r = await getRating(itemId, userId ?? undefined)
        if (!alive) return
        setAverage(r.average || (props.initialAverage ?? 0))
        setCount(r.count)
        setMine(r.userRating)
      } catch {}
    })()
    onCleanup(() => { alive = false })
  })

  const submit = async (value: number) => {
    if (!userId) { setStatus("Sign in to rate"); return }
    const prev = mine()
    setMine(value)
    setSaving(true)
    setStatus(null)
    try {
      const res = await setRating(props.itemId, userId, value)
      setAverage(res.average)
      setCount(res.count)
      setStatus("Thanks for rating!")
      props.onRated?.(res.average, res.count)
    } catch {
      setMine(prev)
      setStatus("Could not save rating")
    } finally {
      setSaving(false)
      setTimeout(() => setStatus(null), 2500)
    }
  }

  const display = () => hover() || mine() || 0

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
      <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
        <div style={{ display: "flex", gap: "2px" }} onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              type="button"
              aria-label={`Rate ${i} star${i > 1 ? "s" : ""}`}
              disabled={saving()}
              onMouseEnter={() => setHover(i)}
              onClick={() => submit(i)}
              style={{
                background: "none", border: "none", padding: "0", "line-height": "0",
                cursor: saving() ? "wait" : "pointer", outline: "none",
                transform: hover() === i ? "scale(1.15)" : "scale(1)",
                transition: "transform 0.12s ease",
              }}
            >
              <Star filled={i <= (display() || Math.round(average()))} />
            </button>
          ))}
        </div>
        <span style={{ "font-size": "13px", color: "#c9d1d9", "font-weight": "600" }}>{(average() || 0).toFixed(1)}</span>
        <span style={{ "font-size": "12px", color: "#8b949e" }}>({count()})</span>
      </div>
      <span style={{ "font-size": "11px", color: status() ? "#58a6ff" : "#484f58", "min-height": "14px" }}>
        {status() ?? (mine() ? `Your rating: ${mine()}\u2605` : userId ? "Click a star to rate" : "Sign in to rate")}
      </span>
    </div>
  )
}

export default RatingStars
