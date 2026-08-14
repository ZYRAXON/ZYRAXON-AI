import { lazy, Suspense, Show, createSignal, onMount } from "solid-js"
import { useNavigate, useSearchParams, useParams } from "@solidjs/router"
import { Button } from "@zyraxon-ai/ui/button"
import { Tooltip } from "@zyraxon-ai/ui/tooltip"
import { AuthCallback } from "@zyraxon/ecosystem"

const EcosystemPage = lazy(() =>
  import("@zyraxon/ecosystem").then((mod) => ({ default: mod.EcosystemPage })),
)

export function EcosystemAuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams<{ code?: string; state?: string }>()

  return (
    <AuthCallback
      code={searchParams.code}
      state={searchParams.state}
      onSuccess={() => navigate("/ecosystem")}
      onError={() => navigate("/ecosystem")}
    />
  )
}

export function EcosystemItemRoute() {
  const params = useParams<{ id: string }>()

  return (
    <div class="h-screen w-screen bg-[#0d1117]">
      <Suspense
        fallback={
          <div class="flex items-center justify-center h-full">
            <div class="text-center">
              <div class="w-12 h-12 border-4 border-[#21262d] border-t-[#58a6ff] rounded-full animate-spin mx-auto mb-4" />
              <p class="text-[#8b949e]">Loading product...</p>
            </div>
          </div>
        }
      >
        <EcosystemPage initialItemId={params.id} />
      </Suspense>
    </div>
  )
}

export function EcosystemRoute() {
  return (
    <div class="h-screen w-screen bg-[#0d1117]">
      <Suspense
        fallback={
          <div class="flex items-center justify-center h-full">
            <div class="text-center">
              <div class="w-12 h-12 border-4 border-[#21262d] border-t-[#58a6ff] rounded-full animate-spin mx-auto mb-4" />
              <p class="text-[#8b949e]">Loading Ecosystem...</p>
            </div>
          </div>
        }
      >
        <EcosystemPage />
      </Suspense>
    </div>
  )
}

export function EcosystemButton() {
  const navigate = useNavigate()
  const [hovered, setHovered] = createSignal(false)

  return (
    <Tooltip placement="bottom" value="ZYRAXON Ecosystem">
      <Button
        variant="ghost"
        class="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[#21262d] transition-colors"
        onClick={() => navigate("/ecosystem")}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
        </svg>
        <Show when={hovered()}>
          <span class="text-sm text-[#c9d1d9]">Ecosystem</span>
        </Show>
      </Button>
    </Tooltip>
  )
}
