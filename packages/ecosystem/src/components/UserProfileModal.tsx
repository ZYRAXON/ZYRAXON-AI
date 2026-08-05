import { type Component, createSignal, createEffect, Show, For, onMount } from "solid-js"
import { IconX, IconLoader, IconUser, IconStar, IconHeart } from "./Icons"
import { getAuthState } from "../services/auth"
import { getGitHubStorage } from "../services/github-data"

interface ProfileData {
  username: string
  displayName: string
  avatarUrl: string
  bio: string
  location: string
  company: string
  blog: string
  followerCount: number
  followingCount: number
  publishedCount: number
  createdAt: string
}

interface UserProfileModalProps {
  username: string
  onClose: () => void
}

export const UserProfileModal: Component<UserProfileModalProps> = (props) => {
  const [profile, setProfile] = createSignal<ProfileData | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [isFollowing, setIsFollowing] = createSignal(false)
  const [followLoading, setFollowLoading] = createSignal(false)
  const [followers, setFollowers] = createSignal<string[]>([])
  const [following, setFollowing] = createSignal<string[]>([])
  const [showFollowers, setShowFollowers] = createSignal(false)
  const [showFollowing, setShowFollowing] = createSignal(false)

  const loadProfile = async () => {
    setLoading(true)
    try {
      const res = await fetch(`https://api.github.com/users/${props.username}`, {
        headers: { Accept: "application/vnd.github.v3+json" },
      })
      if (res.ok) {
        const data = await res.json()
        setProfile({
          username: data.login,
          displayName: data.name || data.login,
          avatarUrl: data.avatar_url,
          bio: data.bio || "",
          location: data.location || "",
          company: data.company || "",
          blog: data.blog || "",
          followerCount: data.followers || 0,
          followingCount: data.following || 0,
          publishedCount: 0,
          createdAt: data.created_at || "",
        })
      }
    } catch {}
    setLoading(false)
  }

  const loadFollowStatus = async () => {
    const auth = getAuthState()
    if (!auth.user || auth.user.username === props.username) return
    const storage = getGitHubStorage()
    if (storage) {
      const following = await storage.isFollowing(props.username)
      setIsFollowing(following)
    }
  }

  const loadFollowData = async () => {
    try {
      const followersRes = await fetch(`https://api.github.com/users/${props.username}/followers?per_page=30`, {
        headers: { Accept: "application/vnd.github.v3+json" },
      })
      if (followersRes.ok) {
        const data = await followersRes.json()
        setFollowers(data.map((u: any) => u.login))
      }
    } catch {}
    try {
      const followingRes = await fetch(`https://api.github.com/users/${props.username}/following?per_page=30`, {
        headers: { Accept: "application/vnd.github.v3+json" },
      })
      if (followingRes.ok) {
        const data = await followingRes.json()
        setFollowing(data.map((u: any) => u.login))
      }
    } catch {}
  }

  const handleFollow = async () => {
    const auth = getAuthState()
    if (!auth.user) return
    setFollowLoading(true)
    try {
      const storage = getGitHubStorage()
      if (storage) {
        if (isFollowing()) {
          await storage.unfollowUser(props.username)
          setIsFollowing(false)
        } else {
          await storage.followUser(props.username)
          setIsFollowing(true)
        }
      }
    } finally {
      setFollowLoading(false)
    }
  }

  onMount(() => {
    loadProfile()
    loadFollowStatus()
    loadFollowData()
  })

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.onClose()
  }
  document.addEventListener("keydown", handleKeyDown)
  const cleanup = () => document.removeEventListener("keydown", handleKeyDown)
  onMount(cleanup)

  const formatDate = (d: string) => {
    if (!d) return ""
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long" })
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose() }}>
      <div class="bg-[#161b22] border border-[#21262d] rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl">
        <div class="relative">
          <div class="h-24 bg-gradient-to-r from-[#1f6feb] to-[#8957e5] rounded-t-2xl" />
          <button onClick={props.onClose}
            class="absolute top-3 right-3 p-1.5 bg-black/30 text-white rounded-lg hover:bg-black/50 transition-colors">
            <IconX size={16} />
          </button>
        </div>

        <div class="px-6 pb-6">
          <Show when={loading()}>
            <div class="flex items-center justify-center py-16 gap-2">
              <IconLoader class="animate-spin text-[#58a6ff]" size={20} />
              <span class="text-sm text-[#8b949e]">Loading profile...</span>
            </div>
          </Show>

          <Show when={!loading() && profile()}>
            <div class="-mt-10 mb-4">
              <img src={profile()!.avatarUrl} alt=""
                class="w-20 h-20 rounded-2xl border-4 border-[#161b22] bg-[#0d1117] object-cover" />
            </div>

            <div class="mb-4">
              <h2 class="text-xl font-bold text-[#c9d1d9]">{profile()!.displayName}</h2>
              <p class="text-sm text-[#8b949e]">@{profile()!.username}</p>
              <Show when={profile()!.bio}>
                <p class="text-sm text-[#c9d1d9] mt-2 leading-relaxed">{profile()!.bio}</p>
              </Show>
            </div>

            <div class="flex flex-wrap gap-4 text-xs text-[#8b949e] mb-4">
              <Show when={profile()!.location}>
                <span>📍 {profile()!.location}</span>
              </Show>
              <Show when={profile()!.company}>
                <span>🏢 {profile()!.company}</span>
              </Show>
              <Show when={profile()!.blog}>
                <a href={profile()!.blog} target="_blank" class="text-[#58a6ff] hover:underline">🔗 {profile()!.blog}</a>
              </Show>
              <Show when={profile()!.createdAt}>
                <span>📅 Joined {formatDate(profile()!.createdAt)}</span>
              </Show>
            </div>

            <div class="flex gap-3 mb-4">
              <button onClick={() => setShowFollowers(true)}
                class="flex items-center gap-1.5 px-3 py-2 bg-[#0d1117] border border-[#21262d] rounded-lg hover:border-[#30363d] transition-colors">
                <IconUser size={14} class="text-[#8b949e]" />
                <span class="text-sm font-bold text-[#c9d1d9]">{followers().length || profile()!.followerCount}</span>
                <span class="text-xs text-[#8b949e]">Followers</span>
              </button>
              <button onClick={() => setShowFollowing(true)}
                class="flex items-center gap-1.5 px-3 py-2 bg-[#0d1117] border border-[#21262d] rounded-lg hover:border-[#30363d] transition-colors">
                <IconUser size={14} class="text-[#8b949e]" />
                <span class="text-sm font-bold text-[#c9d1d9]">{following().length || profile()!.followingCount}</span>
                <span class="text-xs text-[#8b949e]">Following</span>
              </button>
            </div>

            <Show when={getAuthState().user && getAuthState().user!.username !== props.username}>
              <button onClick={handleFollow} disabled={followLoading()}
                class={`w-full py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isFollowing()
                    ? "bg-[#21262d] text-[#c9d1d9] hover:bg-[#da3633]/20 hover:text-[#f85149] border border-[#30363d]"
                    : "bg-[#238636] hover:bg-[#2ea043] text-white"
                }`}>
                {followLoading() ? "..." : isFollowing() ? "Unfollow" : "Follow"}
              </button>
            </Show>
          </Show>
        </div>

        <Show when={showFollowers()}>
          <div class="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowFollowers(false) }}>
            <div class="bg-[#161b22] border border-[#21262d] rounded-xl w-full max-w-sm max-h-[70vh] overflow-hidden">
              <div class="flex items-center justify-between p-4 border-b border-[#21262d]">
                <h3 class="text-sm font-semibold text-[#c9d1d9]">Followers ({followers().length})</h3>
                <button onClick={() => setShowFollowers(false)} class="p-1 text-[#8b949e] hover:text-[#c9d1d9]">
                  <IconX size={16} />
                </button>
              </div>
              <div class="overflow-y-auto max-h-[60vh] p-2">
                <For each={followers()}>
                  {(user) => (
                    <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-[#0d1117] transition-colors cursor-pointer">
                      <img src={`https://github.com/${user}.png?size=32`} alt="" class="w-8 h-8 rounded-full" />
                      <span class="text-sm text-[#c9d1d9]">@{user}</span>
                    </div>
                  )}
                </For>
                <Show when={followers().length === 0}>
                  <p class="text-sm text-[#8b949e] text-center py-8">No followers yet</p>
                </Show>
              </div>
            </div>
          </div>
        </Show>

        <Show when={showFollowing()}>
          <div class="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowFollowing(false) }}>
            <div class="bg-[#161b22] border border-[#21262d] rounded-xl w-full max-w-sm max-h-[70vh] overflow-hidden">
              <div class="flex items-center justify-between p-4 border-b border-[#21262d]">
                <h3 class="text-sm font-semibold text-[#c9d1d9]">Following ({following().length})</h3>
                <button onClick={() => setShowFollowing(false)} class="p-1 text-[#8b949e] hover:text-[#c9d1d9]">
                  <IconX size={16} />
                </button>
              </div>
              <div class="overflow-y-auto max-h-[60vh] p-2">
                <For each={following()}>
                  {(user) => (
                    <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-[#0d1117] transition-colors cursor-pointer">
                      <img src={`https://github.com/${user}.png?size=32`} alt="" class="w-8 h-8 rounded-full" />
                      <span class="text-sm text-[#c9d1d9]">@{user}</span>
                    </div>
                  )}
                </For>
                <Show when={following().length === 0}>
                  <p class="text-sm text-[#8b949e] text-center py-8">Not following anyone yet</p>
                </Show>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
