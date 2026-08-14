import { createMemo, Show } from "solid-js"
import { useSync } from "@/context/sync"
import { useParams } from "@solidjs/router"
import { useTheme } from "@zyraxon-ai/ui/theme/context"
import aiEyesVideo from "@/assets/ai-eyes.mp4"

export function AIEyesOverlay() {
  const sync = useSync()
  const params = useParams()
  const theme = useTheme()

  const isActive = createMemo(() => {
    const id = params.id
    if (!id) return false
    const status = sync().data.session_status[id]
    if (!status) return false
    return status.type !== "idle"
  })

  const isDark = createMemo(() => {
    const scheme = theme.colorScheme()
    return scheme === "dark" || scheme === "system"
  })

  return (
    <Show when={isActive()}>
      <div
        style={{
          "position": "absolute",
          "inset": "0",
          "z-index": "5",
          "pointer-events": "none",
          "display": "flex",
          "align-items": "center",
          "justify-content": "center",
          "overflow": "hidden",
          "opacity": isDark() ? "0.08" : "0.05",
          "mix-blend-mode": isDark() ? "screen" : "multiply",
          "transition": "opacity 0.8s ease-in-out",
        }}
      >
        <video
          src={aiEyesVideo}
          autoplay
          loop
          muted
          playsinline
          style={{
            "width": "100%",
            "height": "100%",
            "object-fit": "cover",
            "filter": isDark()
              ? "brightness(1.2) contrast(1.3)"
              : "brightness(0.8) contrast(1.1) invert(1)",
          }}
        />
      </div>
    </Show>
  )
}
