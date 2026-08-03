import { type Component, createSignal, Show, onMount, onCleanup } from "solid-js"
import { getAuthState, setAuthState, startDeviceFlow, pollDeviceCode, completeDeviceFlowLogin, loginWithToken, logout } from "../services/auth"
import { getAIConnection, type AIEvent } from "../services/ai-connection"
import { IconSettings, IconLogout, IconUser, IconPackage, IconHeart, IconRobot, IconLoader, IconExternalLink, IconKey } from "./Icons"

interface LoginButtonProps {
  onLogin?: () => void
  onLogout?: () => void
  onNavigate?: (view: string) => void
}

export const LoginButton: Component<LoginButtonProps> = (props) => {
  const [auth, setAuth] = createSignal(getAuthState())
  const [showDropdown, setShowDropdown] = createSignal(false)
  const [showDeviceLogin, setShowDeviceLogin] = createSignal(false)
  const [showTokenLogin, setShowTokenLogin] = createSignal(false)
  const [tokenInput, setTokenInput] = createSignal("")
  const [deviceCode, setDeviceCode] = createSignal("")
  const [deviceUrl, setDeviceUrl] = createSignal("")
  const [deviceError, setDeviceError] = createSignal("")
  const [tokenError, setTokenError] = createSignal("")
  const [deviceLoading, setDeviceLoading] = createSignal(false)
  const [tokenLoading, setTokenLoading] = createSignal(false)
  const [aiStatus, setAiStatus] = createSignal<"disconnected" | "connecting" | "connected">("disconnected")
  let pollInterval: ReturnType<typeof setInterval> | null = null

  onMount(() => {
    const ai = getAIConnection()
    const unsubConnected = ai.on("connected", () => setAiStatus("connected"))
    const unsubDisconnected = ai.on("disconnected", () => setAiStatus("disconnected"))
    const unsubMessage = ai.on("message", (event: AIEvent) => {
      if (event.data.text === "Connecting to ZYRAXON AI...") {
        setAiStatus("connecting")
      }
    })

    if (ai.isConnected()) {
      setAiStatus("connected")
    }

    onCleanup(() => {
      unsubConnected()
      unsubDisconnected()
      unsubMessage()
      if (pollInterval) clearInterval(pollInterval)
    })
  })

  const refreshAuth = () => {
    setAuth(getAuthState())
  }

  const handleDeviceLogin = async () => {
    setDeviceLoading(true)
    setDeviceError("")
    try {
      const response = await startDeviceFlow()
      setDeviceCode(response.user_code)
      setDeviceUrl(response.verification_uri)
      setShowDeviceLogin(true)
      setDeviceLoading(false)

      pollInterval = setInterval(async () => {
        const result = await pollDeviceCode()
        if (result?.access_token) {
          if (pollInterval) clearInterval(pollInterval)
          await completeDeviceFlowLogin(result.access_token)
          refreshAuth()
          setShowDeviceLogin(false)
          setDeviceCode("")
          setDeviceUrl("")
          props.onLogin?.()
        }
      }, (response.interval || 5) * 1000)
    } catch (err: any) {
      setDeviceError(err.message || "Failed to start device login")
      setDeviceLoading(false)
    }
  }

  const handleTokenLogin = async () => {
    const token = tokenInput().trim()
    if (!token) {
      setTokenError("Please enter a GitHub token")
      return
    }
    setTokenLoading(true)
    setTokenError("")
    try {
      const user = await loginWithToken(token)
      if (user) {
        refreshAuth()
        setShowTokenLogin(false)
        setTokenInput("")
        props.onLogin?.()
      } else {
        setTokenError("Invalid token. Check your GitHub Personal Access Token.")
      }
    } catch (err: any) {
      setTokenError(err.message || "Login failed")
    } finally {
      setTokenLoading(false)
    }
  }

  const handleCancelDeviceLogin = () => {
    if (pollInterval) clearInterval(pollInterval)
    setShowDeviceLogin(false)
    setDeviceCode("")
    setDeviceUrl("")
    setDeviceError("")
  }

  const handleLogout = () => {
    if (pollInterval) clearInterval(pollInterval)
    logout()
    refreshAuth()
    props.onLogout?.()
    setShowDropdown(false)
  }

  const openLoginOptions = () => {
    setShowDeviceLogin(false)
    setShowTokenLogin(false)
    setDeviceError("")
    setTokenError("")
  }

  return (
    <div class="relative">
      <Show
        when={auth().isAuthenticated}
        fallback={
          <Show
            when={showDeviceLogin()}
            fallback={
              <Show
                when={showTokenLogin()}
                fallback={
                  <button
                    onClick={() => setShowTokenLogin(true)}
                    class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-[#238636] hover:bg-[#2ea043] text-white"
                  >
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    Login with GitHub
                  </button>
                }
              >
                <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div class="bg-[#161b22] border border-[#21262d] rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                    <div class="text-center mb-6">
                      <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#1f6feb] to-[#8957e5] flex items-center justify-center">
                        <IconKey class="text-white" size={28} />
                      </div>
                      <h2 class="text-xl font-bold text-[#c9d1d9] mb-2">Login with GitHub Token</h2>
                      <p class="text-sm text-[#8b949e]">Create a Personal Access Token and paste it below</p>
                    </div>

                    <Show when={!tokenError()}>
                      <div class="mb-4">
                        <div class="bg-[#0d1117] border border-[#21262d] rounded-xl p-4 mb-4">
                          <p class="text-xs font-bold text-[#58a6ff] mb-2">How to create your token:</p>
                          <ol class="text-xs text-[#8b949e] space-y-1.5 list-decimal list-inside">
                            <li>Go to <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" class="text-[#58a6ff] hover:underline">github.com/settings/tokens</a></li>
                            <li>Click <span class="text-[#c9d1d9] font-medium">"Generate new token (classic)"</span></li>
                            <li>Note: Select <span class="text-[#c9d1d9] font-medium">"No expiration"</span> for the token</li>
                            <li>Under <span class="text-[#c9d1d9] font-medium">Select scopes</span>, check ALL boxes:
                              <div class="mt-1.5 ml-4 grid grid-cols-2 gap-1 text-[#8b949e]">
                                <span class="flex items-center gap-1"><span class="text-[#3fb950]">✓</span> repo (all)</span>
                                <span class="flex items-center gap-1"><span class="text-[#3fb950]">✓</span> workflow</span>
                                <span class="flex items-center gap-1"><span class="text-[#3fb950]">✓</span> admin:org</span>
                                <span class="flex items-center gap-1"><span class="text-[#3fb950]">✓</span> admin:public_key</span>
                                <span class="flex items-center gap-1"><span class="text-[#3fb950]">✓</span> admin:repo_hook</span>
                                <span class="flex items-center gap-1"><span class="text-[#3fb950]">✓</span> gist</span>
                                <span class="flex items-center gap-1"><span class="text-[#3fb950]">✓</span> user</span>
                                <span class="flex items-center gap-1"><span class="text-[#3fb950]">✓</span> delete_repo</span>
                              </div>
                            </li>
                            <li>Click <span class="text-[#c9d1d9] font-medium">"Generate token"</span></li>
                            <li>Copy the token and paste it below</li>
                          </ol>
                        </div>

                        <label class="block text-xs text-[#8b949e] mb-2">Personal Access Token</label>
                        <input
                          type="password"
                          value={tokenInput()}
                          onInput={(e) => setTokenInput(e.currentTarget.value)}
                           placeholder="Enter your GitHub token"
                          class="w-full px-4 py-3 bg-[#0d1117] border border-[#21262d] rounded-xl text-[#c9d1d9] font-mono text-sm placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none transition-colors"
                          onKeyDown={(e) => { if (e.key === "Enter") handleTokenLogin() }}
                        />
                        <p class="text-xs text-[#8b949e] mt-2">
                          Your token will be used to access GitHub APIs and publish to the ZYRAXON Ecosystem marketplace.
                        </p>
                      </div>
                    </Show>

                    <Show when={tokenError()}>
                      <div class="bg-[#f85149]/10 border border-[#f85149]/20 rounded-xl p-4 mb-6">
                        <p class="text-sm text-[#f85149] text-center">{tokenError()}</p>
                      </div>
                    </Show>

                    <div class="flex gap-3">
                      <button
                        onClick={() => { setShowTokenLogin(false); setTokenError(""); setTokenInput("") }}
                        class="flex-1 px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] rounded-xl text-sm transition-colors"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleTokenLogin}
                        disabled={tokenLoading()}
                        class={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                          tokenLoading()
                            ? "bg-[#21262d] text-[#8b949e] cursor-wait"
                            : "bg-[#238636] hover:bg-[#2ea043] text-white"
                        }`}
                      >
                        {tokenLoading() ? (
                          <><IconLoader size={16} /> Verifying...</>
                        ) : (
                          "Login"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </Show>
            }
          >
            <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div class="bg-[#161b22] border border-[#21262d] rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
                <div class="text-center mb-6">
                  <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#1f6feb] to-[#8957e5] flex items-center justify-center">
                    <IconExternalLink class="text-white" size={28} />
                  </div>
                  <h2 class="text-xl font-bold text-[#c9d1d9] mb-2">GitHub Device Login</h2>
                  <p class="text-sm text-[#8b949e]">Enter the code below on GitHub to authorize ZYRAXON</p>
                </div>

                <Show when={!deviceError()}>
                  <div class="bg-[#0d1117] border border-[#21262d] rounded-xl p-6 mb-6 text-center">
                    <p class="text-xs text-[#8b949e] mb-2">Your one-time code:</p>
                    <p class="text-4xl font-mono font-bold text-[#58a6ff] tracking-[0.3em]">{deviceCode()}</p>
                  </div>

                  <div class="space-y-3 mb-6">
                    <a
                      href={deviceUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[#238636] hover:bg-[#2ea043] text-white rounded-xl text-sm font-medium transition-colors"
                    >
                      <IconExternalLink size={16} />
                      Open GitHub to Authorize
                    </a>
                    <p class="text-xs text-[#8b949e] text-center">
                      Or visit <span class="text-[#58a6ff]">{deviceUrl()}</span> manually
                    </p>
                  </div>

                  <div class="flex items-center justify-center gap-3 text-sm text-[#8b949e] mb-4">
                    <IconLoader size={16} class="text-[#58a6ff]" />
                    <span>Waiting for authorization...</span>
                  </div>
                </Show>

                <Show when={deviceError()}>
                  <div class="bg-[#f85149]/10 border border-[#f85149]/20 rounded-xl p-4 mb-6">
                    <p class="text-sm text-[#f85149] text-center">{deviceError()}</p>
                    <p class="text-xs text-[#8b949e] text-center mt-2">
                      Device Flow may not be enabled. Try Token Login instead.
                    </p>
                  </div>
                </Show>

                <div class="flex gap-3">
                  <button
                    onClick={() => { handleCancelDeviceLogin(); setShowTokenLogin(true) }}
                    class="flex-1 px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] rounded-xl text-sm transition-colors"
                  >
                    Use Token Instead
                  </button>
                  <button
                    onClick={handleCancelDeviceLogin}
                    class="flex-1 px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] rounded-xl text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </Show>
        }
      >
        <div class="flex items-center gap-2">
          <div class={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
            aiStatus() === "connected"
              ? "bg-[#238636]/20 text-[#3fb950]"
              : aiStatus() === "connecting"
              ? "bg-[#e3b341]/20 text-[#e3b341]"
              : "bg-[#21262d] text-[#8b949e]"
          }`}>
            <span class={`w-2 h-2 rounded-full ${
              aiStatus() === "connected"
                ? "bg-[#3fb950] animate-pulse"
                : aiStatus() === "connecting"
                ? "bg-[#e3b341] animate-pulse"
                : "bg-[#8b949e]"
            }`} />
            {aiStatus() === "connected" ? "AI Connected" : aiStatus() === "connecting" ? "Connecting..." : "AI Off"}
          </div>

          <button
            onClick={() => setShowDropdown(!showDropdown())}
            class="flex items-center gap-2 px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] rounded-lg transition-colors"
          >
            <img src={auth().user?.avatarUrl} alt="" class="w-6 h-6 rounded-full" />
            <span class="text-sm text-[#c9d1d9]">{auth().user?.username}</span>
            <svg class="w-3 h-3 text-[#8b949e]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        </div>

        <Show when={showDropdown()}>
          <div class="absolute right-0 top-full mt-2 w-64 bg-[#161b22] border border-[#21262d] rounded-xl shadow-2xl overflow-hidden z-50">
            <div class="p-3 border-b border-[#21262d]">
              <div class="flex items-center gap-3">
                <img src={auth().user?.avatarUrl} alt="" class="w-10 h-10 rounded-full" />
                <div>
                  <p class="text-sm font-medium text-[#c9d1d9]">{auth().user?.displayName}</p>
                  <p class="text-xs text-[#8b949e]">@{auth().user?.username}</p>
                </div>
              </div>
              <div class="mt-2 flex items-center gap-2">
                <span class={`px-2 py-0.5 rounded-full text-xs ${
                  aiStatus() === "connected"
                    ? "bg-[#238636]/20 text-[#3fb950]"
                    : aiStatus() === "connecting"
                    ? "bg-[#e3b341]/20 text-[#e3b341]"
                    : "bg-[#21262d] text-[#8b949e]"
                }`}>
                  {aiStatus() === "connected" ? "AI Active" : aiStatus() === "connecting" ? "AI Connecting..." : "AI Inactive"}
                </span>
              </div>
            </div>
            <div class="p-1">
              <button
                onClick={() => { props.onNavigate?.("profile"); setShowDropdown(false) }}
                class="flex items-center gap-2 px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors w-full"
              >
                <IconUser size={16} class="text-[#8b949e]" />
                My Profile
              </button>
              <button
                onClick={() => { props.onNavigate?.("my-plugins"); setShowDropdown(false) }}
                class="flex items-center gap-2 px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors w-full"
              >
                <IconPackage size={16} class="text-[#8b949e]" />
                My Published Items
              </button>
              <button
                onClick={() => { props.onNavigate?.("my-favorites"); setShowDropdown(false) }}
                class="flex items-center gap-2 px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors w-full"
              >
                <IconHeart size={16} class="text-[#8b949e]" />
                My Likes
              </button>
              <button
                onClick={() => { props.onNavigate?.("ai-settings"); setShowDropdown(false) }}
                class="flex items-center gap-2 px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors w-full"
              >
                <IconRobot size={16} class="text-[#8b949e]" />
                AI Settings
              </button>
              <button
                onClick={() => { props.onNavigate?.("settings"); setShowDropdown(false) }}
                class="flex items-center gap-2 px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors w-full"
              >
                <IconSettings size={16} class="text-[#8b949e]" />
                Settings
              </button>
            </div>
            <div class="p-1 border-t border-[#21262d]">
              <button
                onClick={handleLogout}
                class="flex items-center gap-2 px-3 py-2 text-sm text-[#f85149] hover:bg-[#21262d] rounded-lg transition-colors w-full"
              >
                <IconLogout size={16} />
                Logout
              </button>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  )
}
